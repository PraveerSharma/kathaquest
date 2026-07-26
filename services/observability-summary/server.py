import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


CLICKHOUSE_URL = os.environ.get(
    "CLICKHOUSE_URL",
    "http://signoz-telemetrystore-clickhouse-0-0:8123",
)
PORT = int(os.environ.get("PORT", "8100"))

DEDUP = """
SELECT
  span_id,
  argMax(trace_id, timestamp) AS trace_id,
  max(timestamp) AS event_time,
  argMax(name, timestamp) AS name,
  argMax(duration_nano, timestamp) AS duration_nano,
  max(toUInt8(has_error)) AS has_error,
  argMax(external_http_url, timestamp) AS external_http_url,
  argMax(attributes_string, timestamp) AS attributes_string,
  argMax(attributes_number, timestamp) AS attributes_number
FROM signoz_traces.signoz_index_v3
WHERE resource_string_service$$name = 'kathaquest'
  AND timestamp > now() - INTERVAL 24 HOUR
GROUP BY span_id
"""

SUMMARY_QUERY = f"""
WITH dedup AS ({DEDUP})
SELECT
  uniqExact(trace_id) AS traces,
  count() AS spans,
  countIf(has_error = 1) AS errors,
  countIf(name = 'lesson.generate') AS lessons,
  countIf(name = 'lesson.generate' AND has_error = 0) AS successful_lessons,
  round(quantileExact(0.95)(duration_nano) / 1000000, 1) AS p95_latency_ms,
  round(quantileExactIf(0.95)(duration_nano, name = 'lesson.generate') / 1000000, 1)
    AS lesson_p95_latency_ms,
  countIf(external_http_url LIKE '%openai.com%') AS openai_calls,
  countIf(external_http_url LIKE '%videodb.io%') AS videodb_calls,
  countIf(name = 'tts.generate') AS narrations,
  countIf(name = 'quiz.evaluate') AS quiz_checks,
  round(
    avgIf(
      attributes_number['video.relevance_score'],
      mapContains(attributes_number, 'video.relevance_score')
    ),
    3
  ) AS relevance_score,
  max(event_time) AS latest_span_at
FROM dedup
FORMAT JSON
"""

RECENT_QUERY = f"""
WITH dedup AS ({DEDUP})
SELECT
  name,
  max(event_time) AS latest_event_time,
  round(argMax(duration_nano, event_time) / 1000000, 1) AS duration_ms,
  argMax(has_error, event_time) AS has_error,
  argMax(attributes_string['lesson.language'], event_time) AS language,
  argMax(attributes_string['ai.provider'], event_time) AS provider
FROM dedup
WHERE name IN (
  'lesson.generate',
  'llm.extract_concepts',
  'llm.create_lesson_presentation',
  'videodb.search_concept',
  'videodb.rerank_candidates',
  'videodb.compile_episode',
  'tts.generate',
  'quiz.evaluate',
  'lesson.persist'
)
GROUP BY name
ORDER BY latest_event_time DESC
LIMIT 10
FORMAT JSON
"""

TREND_QUERY = f"""
WITH dedup AS ({DEDUP})
SELECT
  toStartOfInterval(event_time, INTERVAL 2 HOUR) AS bucket,
  uniqExact(trace_id) AS traces,
  count() AS spans
FROM dedup
GROUP BY bucket
ORDER BY bucket
FORMAT JSON
"""


def query_clickhouse(query):
    request = urllib.request.Request(
        CLICKHOUSE_URL,
        data=query.encode("utf-8"),
        headers={"Content-Type": "text/plain; charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))["data"]


def build_summary():
    summary_rows = query_clickhouse(SUMMARY_QUERY)
    summary = summary_rows[0] if summary_rows else {}
    lessons = int(summary.get("lessons", 0))
    successful_lessons = int(summary.get("successful_lessons", 0))
    spans = int(summary.get("spans", 0))
    errors = int(summary.get("errors", 0))

    recent = query_clickhouse(RECENT_QUERY)
    for item in recent:
        item["event_time"] = item.pop("latest_event_time")

    return {
        "status": "live",
        "service": "kathaquest",
        "windowHours": 24,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "latestSpanAt": summary.get("latest_span_at"),
        "metrics": {
            "traces": int(summary.get("traces", 0)),
            "spans": spans,
            "errors": errors,
            "errorRate": round((errors / spans) * 100, 2) if spans else 0,
            "lessons": lessons,
            "successfulLessons": successful_lessons,
            "lessonSuccessRate": (
                round((successful_lessons / lessons) * 100, 1) if lessons else 0
            ),
            "p95LatencyMs": float(summary.get("p95_latency_ms", 0)),
            "lessonP95LatencyMs": float(
                summary.get("lesson_p95_latency_ms", 0)
            ),
            "relevanceScore": float(summary.get("relevance_score", 0)),
            "openaiCalls": int(summary.get("openai_calls", 0)),
            "videoDbCalls": int(summary.get("videodb_calls", 0)),
            "narrations": int(summary.get("narrations", 0)),
            "quizChecks": int(summary.get("quiz_checks", 0)),
        },
        "trend": query_clickhouse(TREND_QUERY),
        "recent": recent,
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, body):
        payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"status": "ok"})
            return
        if self.path != "/summary":
            self.send_json(404, {"error": "Not found"})
            return
        try:
            self.send_json(200, build_summary())
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            self.send_json(
                503,
                {
                    "status": "unavailable",
                    "error": type(error).__name__,
                },
            )

    def log_message(self, message, *args):
        print(
            "%s observability-summary %s"
            % (self.log_date_time_string(), message % args),
            flush=True,
        )


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"observability-summary listening on {PORT}", flush=True)
    server.serve_forever()
