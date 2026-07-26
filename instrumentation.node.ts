import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import {
  OTLPHttpJsonTraceExporter,
  registerOTel,
} from "@vercel/otel";

declare global {
  var __kathaquestOtelStarted: boolean | undefined;
}

function exporterHeaders(): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  const configured = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  if (configured) {
    for (const pair of configured.split(",")) {
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const key = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (key && value) headers[key] = decodeURIComponent(value);
    }
  }
  if (process.env.SIGNOZ_INGESTION_KEY) {
    headers["signoz-ingestion-key"] =
      process.env.SIGNOZ_INGESTION_KEY;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

const serviceName = process.env.OTEL_SERVICE_NAME ?? "kathaquest";
const tracesUrl =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
  "http://localhost:4318/v1/traces";

if (!globalThis.__kathaquestOtelStarted) {
  if (process.env.VERCEL) {
    if (process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
      registerOTel({
        serviceName,
        traceExporter: new OTLPHttpJsonTraceExporter({
          url: tracesUrl,
          headers: exporterHeaders(),
        }),
      });
      globalThis.__kathaquestOtelStarted = true;
    }
  } else {
    const metricsUrl =
      process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ??
      "http://localhost:4318/v1/metrics";
    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        "deployment.environment.name":
          process.env.VERCEL_ENV ??
          process.env.NODE_ENV ??
          "development",
      }),
      traceExporter: new OTLPTraceExporter({
        url: tracesUrl,
        headers: exporterHeaders(),
      }),
      metricReaders: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: metricsUrl,
            headers: exporterHeaders(),
          }),
          exportIntervalMillis: 10_000,
        }),
      ],
    });
    sdk.start();
    globalThis.__kathaquestOtelStarted = true;
  }
}
