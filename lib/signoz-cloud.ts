import "server-only";

import { unstable_cache } from "next/cache";

import { env, requireEnv } from "@/lib/env";

type JsonRecord = Record<string, unknown>;
type McpEnvelope = {
  error?: { message?: string };
  result?: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
    structuredContent?: unknown;
  };
};

const windowHours = 24;
const customOperations = [
  "curiosity.answer",
  "curiosity.generate",
  "curiosity.generate_narration",
  "lesson.generate",
  "lesson.persist",
  "llm.extract_concepts",
  "llm.create_lesson_presentation",
  "llm.create_curiosity_clip",
  "quiz.evaluate",
  "tts.generate",
  "tts.fallback",
  "videodb.compile_episode",
  "videodb.rerank_candidates",
  "videodb.search_concept",
];

async function callSigNozTool(name: string, args: JsonRecord) {
  const response = await fetch(env.SIGNOZ_MCP_URL, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "SIGNOZ-API-KEY": requireEnv("SIGNOZ_API_KEY"),
      "X-SigNoz-URL": env.SIGNOZ_URL,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name,
        arguments: {
          ...args,
          searchContext:
            "Show the live KathaQuest production observability summary.",
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${name} failed with HTTP ${response.status}`);
  }

  const envelope = (await response.json()) as McpEnvelope;
  if (envelope.error || !envelope.result || envelope.result.isError) {
    const detail =
      envelope.result?.content
        ?.map((item) => item.text)
        .filter(Boolean)
        .join("\n") ?? envelope.error?.message;
    throw new Error(detail ?? `${name} failed`);
  }
  if (envelope.result.structuredContent) {
    return envelope.result.structuredContent as JsonRecord;
  }
  for (const item of envelope.result.content ?? []) {
    if (!item.text) continue;
    try {
      return JSON.parse(item.text) as JsonRecord;
    } catch {
      // Ignore explanatory MCP content and keep looking for JSON.
    }
  }
  throw new Error(`${name} returned no structured data`);
}

function queryResults(result: JsonRecord) {
  const outerData = result.data as JsonRecord | undefined;
  const innerData = outerData?.data as JsonRecord | undefined;
  return (innerData?.results as JsonRecord[] | undefined) ?? [];
}

function scalar(result: JsonRecord) {
  const rows = queryResults(result)[0]?.data as unknown[][] | undefined;
  const value = rows?.[0]?.at(-1);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function operationCounts(result: JsonRecord) {
  const rows = queryResults(result)[0]?.data as unknown[][] | undefined;
  return new Map(
    (rows ?? [])
      .filter(
        (row): row is [string, number] =>
          typeof row[0] === "string" && typeof row[1] === "number",
      )
      .map(([name, count]) => [name, count]),
  );
}

function traceTrend(result: JsonRecord) {
  const aggregations = queryResults(result)[0]?.aggregations as
    | Array<{
        series?: Array<{
          values?: Array<{ timestamp?: number; value?: number }>;
        }>;
      }>
    | undefined;
  return (aggregations?.[0]?.series?.[0]?.values ?? [])
    .filter(
      (
        value,
      ): value is {
        timestamp: number;
        value: number;
      } =>
        typeof value.timestamp === "number" &&
        typeof value.value === "number",
    )
    .map((value) => ({
      bucket: new Date(value.timestamp).toISOString(),
      traces: 0,
      spans: value.value,
    }));
}

function recentOperations(result: JsonRecord) {
  const rows = queryResults(result)[0]?.rows as
    | Array<{ data?: JsonRecord; timestamp?: string }>
    | undefined;
  return (rows ?? []).map((row) => {
    const data = row.data ?? {};
    const durationNanos =
      typeof data.duration_nano === "number" ? data.duration_nano : 0;
    return {
      event_time:
        (typeof data.timestamp === "string" && data.timestamp) ||
        row.timestamp ||
        new Date().toISOString(),
      name: typeof data.name === "string" ? data.name : "kathaquest.operation",
      duration_ms: durationNanos / 1_000_000,
      has_error: data.has_error === true ? 1 : 0,
      language:
        typeof data["lesson.language"] === "string"
          ? data["lesson.language"]
          : "",
      provider:
        typeof data["ai.provider"] === "string" ? data["ai.provider"] : "",
    };
  });
}

async function optionalScalar(promise: Promise<JsonRecord>) {
  try {
    return scalar(await promise);
  } catch {
    return 0;
  }
}

async function loadCloudSummary() {
  const base = {
    service: "kathaquest",
    timeRange: `${windowHours}h`,
  };
  const now = Date.now();
  const [
    traces,
    spans,
    errors,
    lessons,
    successfulLessons,
    p95Latency,
    lessonP95Latency,
    relevance,
    operationsResult,
    trendResult,
    recentResult,
  ] = await Promise.all([
    optionalScalar(
      callSigNozTool("signoz_aggregate_traces", {
        ...base,
        aggregation: "count_distinct",
        aggregateOn: "trace_id",
      }),
    ),
    optionalScalar(
      callSigNozTool("signoz_aggregate_traces", {
        ...base,
        aggregation: "count",
      }),
    ),
    optionalScalar(
      callSigNozTool("signoz_aggregate_traces", {
        ...base,
        aggregation: "count",
        error: true,
      }),
    ),
    optionalScalar(
      callSigNozTool("signoz_aggregate_traces", {
        ...base,
        aggregation: "count",
        operation: "lesson.generate",
      }),
    ),
    optionalScalar(
      callSigNozTool("signoz_aggregate_traces", {
        ...base,
        aggregation: "count",
        operation: "lesson.generate",
        error: false,
      }),
    ),
    optionalScalar(
      callSigNozTool("signoz_aggregate_traces", {
        ...base,
        aggregation: "p95",
        aggregateOn: "duration_nano",
      }),
    ),
    optionalScalar(
      callSigNozTool("signoz_aggregate_traces", {
        ...base,
        aggregation: "p95",
        aggregateOn: "duration_nano",
        operation: "lesson.generate",
      }),
    ),
    optionalScalar(
      callSigNozTool("signoz_execute_builder_query", {
        query: {
          schemaVersion: "v1",
          start: now - windowHours * 60 * 60 * 1_000,
          end: now,
          requestType: "scalar",
          compositeQuery: {
            queries: [
              {
                type: "builder_query",
                spec: {
                  signal: "traces",
                  name: "A",
                  aggregations: [
                    { expression: "avg(video.relevance_score)" },
                  ],
                  filter: {
                    expression:
                      "service.name = 'kathaquest' AND video.relevance_score EXISTS",
                  },
                  order: [
                    {
                      key: { name: "avg(video.relevance_score)" },
                      direction: "desc",
                    },
                  ],
                  limit: 100,
                },
              },
            ],
          },
          formatOptions: {
            formatTableResultForUI: false,
            fillGaps: false,
          },
          variables: {},
        },
      }),
    ),
    callSigNozTool("signoz_aggregate_traces", {
      ...base,
      aggregation: "count",
      groupBy: "name",
      limit: 100,
    }),
    callSigNozTool("signoz_aggregate_traces", {
      ...base,
      aggregation: "count",
      requestType: "time_series",
      stepInterval: 7_200,
    }),
    callSigNozTool("signoz_search_traces", {
      ...base,
      filter: `name IN (${customOperations
        .map((name) => `'${name}'`)
        .join(", ")})`,
      limit: 12,
    }),
  ]);

  const counts = operationCounts(operationsResult);
  const recent = recentOperations(recentResult);
  const traceCount = Math.round(traces);
  const spanCount = Math.round(spans);
  const errorCount = Math.round(errors);
  const lessonCount = Math.round(lessons);
  const successfulLessonCount = Math.round(successfulLessons);

  return {
    status: "live" as const,
    service: "kathaquest",
    windowHours,
    generatedAt: new Date().toISOString(),
    latestSpanAt: recent[0]?.event_time,
    metrics: {
      traces: traceCount,
      spans: spanCount,
      errors: errorCount,
      errorRate:
        spanCount > 0 ? Number(((errorCount / spanCount) * 100).toFixed(1)) : 0,
      lessons: lessonCount,
      successfulLessons: successfulLessonCount,
      lessonSuccessRate:
        lessonCount > 0
          ? Number(
              ((successfulLessonCount / lessonCount) * 100).toFixed(1),
            )
          : 100,
      p95LatencyMs: p95Latency / 1_000_000,
      lessonP95LatencyMs: lessonP95Latency / 1_000_000,
      relevanceScore: relevance,
      openaiCalls: [...counts.entries()]
        .filter(
          ([name]) =>
            name.startsWith("llm.") || name === "videodb.rerank_candidates",
        )
        .reduce((total, [, count]) => total + count, 0),
      videoDbCalls: [...counts.entries()]
        .filter(([name]) => name.startsWith("videodb."))
        .reduce((total, [, count]) => total + count, 0),
      narrations:
        (counts.get("tts.generate") ?? 0) +
        (counts.get("curiosity.generate_narration") ?? 0),
      quizChecks: counts.get("quiz.evaluate") ?? 0,
    },
    trend: traceTrend(trendResult),
    recent,
  };
}

export const getCloudObservabilitySummary = unstable_cache(
  loadCloudSummary,
  ["kathaquest-signoz-cloud-summary-v1"],
  { revalidate: 30 },
);
