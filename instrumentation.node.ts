import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

declare global {
  var __kathaquestOtelStarted: boolean | undefined;
}

if (!globalThis.__kathaquestOtelStarted) {
  const serviceName = process.env.OTEL_SERVICE_NAME ?? "kathaquest";
  const tracesUrl =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
    "http://localhost:4318/v1/traces";
  const metricsUrl =
    process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ??
    "http://localhost:4318/v1/metrics";

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      "deployment.environment.name":
        process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    }),
    traceExporter: new OTLPTraceExporter({ url: tracesUrl }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: metricsUrl }),
        exportIntervalMillis: 10_000,
      }),
    ],
  });

  sdk.start();
  globalThis.__kathaquestOtelStarted = true;
}
