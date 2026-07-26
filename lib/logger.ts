import "server-only";

import { trace } from "@opentelemetry/api";
import pino from "pino";

const baseLogger = pino({
  base: {
    service: process.env.OTEL_SERVICE_NAME ?? "kathaquest",
  },
  level: process.env.LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});

type LogContext = {
  lessonId?: string;
  event: string;
  provider?: string;
  error?: string;
  [key: string]: unknown;
};

function withTrace(context: LogContext) {
  const span = trace.getActiveSpan();
  const spanContext = span?.spanContext();
  return {
    ...context,
    traceId: spanContext?.traceId,
    spanId: spanContext?.spanId,
  };
}

export const logger = {
  info(context: LogContext, message: string) {
    baseLogger.info(withTrace(context), message);
  },
  warn(context: LogContext, message: string) {
    baseLogger.warn(withTrace(context), message);
  },
  error(context: LogContext, message: string) {
    baseLogger.error(withTrace(context), message);
  },
};
