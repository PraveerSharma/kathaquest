import {
  SpanKind,
  SpanStatusCode,
  metrics,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";

const meter = metrics.getMeter("kathaquest.pipeline");

export const telemetry = {
  lessonsGenerated: meter.createCounter("kathaquest.lesson.generated"),
  lessonsFailed: meter.createCounter("kathaquest.lesson.failed"),
  lessonDuration: meter.createHistogram("kathaquest.lesson.duration", {
    unit: "ms",
  }),
  videoSearchDuration: meter.createHistogram(
    "kathaquest.videodb.search.duration",
    { unit: "ms" },
  ),
  videoSearchResults: meter.createHistogram(
    "kathaquest.videodb.search.results",
  ),
  emptyVideoResults: meter.createCounter(
    "kathaquest.videodb.empty_results",
  ),
  visualFallbacks: meter.createCounter(
    "kathaquest.lesson.visual_fallbacks",
  ),
  ttsRequestDuration: meter.createHistogram(
    "kathaquest.tts.request.duration",
    { unit: "ms" },
  ),
  ttsFailures: meter.createCounter("kathaquest.tts.failures"),
  ttsFallbacks: meter.createCounter("kathaquest.tts.fallbacks"),
  questionsAsked: meter.createCounter("kathaquest.questions.asked"),
  revisionsGenerated: meter.createCounter("kathaquest.revision.generated"),
  presentationsGenerated: meter.createCounter(
    "kathaquest.presentation.generated",
  ),
  presentationFallbacks: meter.createCounter(
    "kathaquest.presentation.fallbacks",
  ),
  presentationNarrations: meter.createCounter(
    "kathaquest.presentation.narrations",
  ),
};

export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  task: (span: Span) => Promise<T>,
): Promise<T> {
  return trace.getTracer("kathaquest.pipeline").startActiveSpan(
    name,
    { kind: SpanKind.INTERNAL, attributes },
    async (span) => {
      try {
        const result = await task(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        span.recordException(normalized);
        span.setAttributes({
          "error.type": normalized.name,
          "error.retryable": false,
        });
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: normalized.message,
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export function activeTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}
