const mcpUrl = process.env.SIGNOZ_MCP_URL ?? "http://localhost:8000/mcp";
const apiKey = process.env.SIGNOZ_API_KEY;
const webhookUrl = process.env.KATHAQUEST_ALERT_WEBHOOK_URL;
const webhookUsername = process.env.SIGNOZ_WEBHOOK_USERNAME;
const webhookPassword = process.env.SIGNOZ_WEBHOOK_PASSWORD;
const searchContext =
  "Configure a complete SigNoz dashboard and alerts for the KathaQuest AI lesson pipeline.";

if (!apiKey) {
  throw new Error("SIGNOZ_API_KEY is required");
}
const signozApiKey = apiKey;

type JsonObject = Record<string, unknown>;
type McpResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
  structuredContent?: unknown;
};

async function mcpCall(name: string, args: JsonObject = {}) {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "signoz-api-key": signozApiKey,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name,
        arguments: { ...args, searchContext },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`${name} failed with HTTP ${response.status}`);
  }
  const envelope = (await response.json()) as {
    error?: { message?: string };
    result?: McpResult;
  };
  if (envelope.error || !envelope.result) {
    throw new Error(envelope.error?.message ?? `${name} returned no result`);
  }
  if (envelope.result.isError) {
    throw new Error(
      envelope.result.content?.map((item) => item.text).join("\n") ??
        `${name} failed`,
    );
  }
  return envelope.result;
}

function parsedData(result: McpResult) {
  if (result.structuredContent) return result.structuredContent as JsonObject;
  for (const item of result.content ?? []) {
    if (!item.text) continue;
    try {
      return JSON.parse(item.text) as JsonObject;
    } catch {
      // Some MCP responses include explanatory text after their JSON result.
    }
  }
  return {};
}

const traceField = (
  name: string,
  fieldContext: "resource" | "attribute" | "span",
  fieldDataType: "string" | "bool" | "number" = "string",
) => ({
  name,
  fieldContext,
  fieldDataType,
  signal: "traces",
});

const traceQuery = ({
  name = "A",
  aggregations,
  filter,
  groupBy,
  legend,
  selectFields,
  limit = 100,
}: {
  name?: string;
  aggregations?: Array<{ expression: string; alias?: string }>;
  filter: string;
  groupBy?: ReturnType<typeof traceField>[];
  legend?: string;
  selectFields?: ReturnType<typeof traceField>[];
  limit?: number;
}) => ({
  signal: "traces",
  name,
  ...(aggregations ? { aggregations } : {}),
  filter: { expression: filter },
  ...(groupBy ? { groupBy } : {}),
  ...(legend ? { legend } : {}),
  ...(selectFields ? { selectFields } : {}),
  order: [
    {
      key: {
        name: aggregations?.[0]?.expression ?? "timestamp",
      },
      direction: "desc",
    },
  ],
  limit,
});

const metricQuery = ({
  name,
  temporality,
  timeAggregation,
  spaceAggregation,
  reduceTo,
}: {
  name: string;
  temporality: "cumulative" | "delta" | "unspecified";
  timeAggregation: string;
  spaceAggregation: string;
  reduceTo?: string;
}) => ({
  signal: "metrics",
  name: "A",
  aggregations: [
    {
      metricName: name,
      temporality,
      timeAggregation,
      spaceAggregation,
      ...(reduceTo ? { reduceTo } : {}),
    },
  ],
  filter: { expression: "service.name = 'kathaquest'" },
  order: [{ key: { name: "__result" }, direction: "desc" }],
  limit: 100,
});

function panel({
  title,
  description,
  panelKind,
  requestKind,
  query,
  pluginSpec = {},
  queryName = "A",
}: {
  title: string;
  description: string;
  panelKind: string;
  requestKind: "scalar" | "time_series" | "raw";
  query: JsonObject;
  pluginSpec?: JsonObject;
  queryName?: string;
}) {
  return {
    kind: "Panel",
    spec: {
      display: { name: title, description },
      plugin: { kind: panelKind, spec: pluginSpec },
      queries: [
        {
          kind: requestKind,
          spec: {
            name: queryName,
            plugin: { kind: "signoz/BuilderQuery", spec: query },
          },
        },
      ],
    },
  };
}

const dashboardPanels = {
  "lessons-generated": panel({
    title: "Lessons generated",
    description: "Completed KathaQuest lessons in the selected time range",
    panelKind: "signoz/NumberPanel",
    requestKind: "scalar",
    query: metricQuery({
      name: "kathaquest.lesson.generated",
      temporality: "cumulative",
      timeAggregation: "increase",
      spaceAggregation: "sum",
      reduceTo: "sum",
    }),
  }),
  "lesson-p95": panel({
    title: "Lesson generation p95",
    description: "95th-percentile end-to-end lesson pipeline latency",
    panelKind: "signoz/NumberPanel",
    requestKind: "scalar",
    query: traceQuery({
      aggregations: [{ expression: "p95(duration_nano)" }],
      filter: "service.name = 'kathaquest' AND name = 'lesson.generate'",
    }),
    pluginSpec: { formatting: { unit: "ns" } },
  }),
  "video-relevance": panel({
    title: "Video relevance",
    description: "Average VideoDB reranking score for selected evidence",
    panelKind: "signoz/NumberPanel",
    requestKind: "scalar",
    query: traceQuery({
      aggregations: [{ expression: "avg(video.relevance_score)" }],
      filter:
        "service.name = 'kathaquest' AND video.relevance_score EXISTS",
    }),
  }),
  "error-spans": panel({
    title: "Errored spans",
    description: "Pipeline spans marked as errors",
    panelKind: "signoz/NumberPanel",
    requestKind: "scalar",
    query: traceQuery({
      aggregations: [{ expression: "count()" }],
      filter: "service.name = 'kathaquest' AND has_error = true",
    }),
  }),
  "lesson-throughput": panel({
    title: "Lesson attempts over time",
    description: "Lesson pipeline starts by minute",
    panelKind: "signoz/TimeSeriesPanel",
    requestKind: "time_series",
    query: {
      ...traceQuery({
        aggregations: [{ expression: "count()" }],
        filter: "service.name = 'kathaquest' AND name = 'lesson.generate'",
      }),
      stepInterval: 60,
      legend: "Lesson attempts",
    },
    pluginSpec: { legend: { position: "bottom" } },
  }),
  "pipeline-latency": panel({
    title: "Pipeline p95 by stage",
    description:
      "Latency of planning, retrieval, storyboarding, narration, and the full lesson",
    panelKind: "signoz/TimeSeriesPanel",
    requestKind: "time_series",
    query: {
      ...traceQuery({
        aggregations: [{ expression: "p95(duration_nano)" }],
        filter:
          "service.name = 'kathaquest' AND name IN ('lesson.generate', 'llm.extract_concepts', 'videodb.search_concept', 'llm.create_lesson_presentation', 'tts.generate')",
        groupBy: [traceField("name", "span")],
        legend: "{{name}}",
      }),
      stepInterval: 60,
    },
    pluginSpec: {
      legend: { position: "bottom" },
      formatting: { unit: "ns" },
    },
  }),
  "videodb-latency": panel({
    title: "VideoDB search p95",
    description: "95th-percentile semantic video retrieval latency",
    panelKind: "signoz/TimeSeriesPanel",
    requestKind: "time_series",
    query: {
      ...metricQuery({
        name: "kathaquest.videodb.search.duration.bucket",
        temporality: "cumulative",
        timeAggregation: "",
        spaceAggregation: "p95",
      }),
      stepInterval: 60,
      legend: "VideoDB p95",
    },
    pluginSpec: {
      legend: { position: "bottom" },
      formatting: { unit: "ms" },
    },
  }),
  "provider-usage": panel({
    title: "AI provider usage",
    description: "Call count and average latency by provider and model",
    panelKind: "signoz/TablePanel",
    requestKind: "scalar",
    query: traceQuery({
      aggregations: [
        { expression: "count()", alias: "Calls" },
        { expression: "avg(duration_nano)", alias: "Average latency" },
      ],
      filter: "service.name = 'kathaquest' AND ai.provider EXISTS",
      groupBy: [
        traceField("ai.provider", "attribute"),
        traceField("ai.model", "attribute"),
      ],
      legend: "{{ai.provider}} / {{ai.model}}",
    }),
    pluginSpec: {
      formatting: { columnUnits: { "Average latency": "ns" } },
    },
  }),
  "retrieval-quality": panel({
    title: "Retrieval quality",
    description:
      "VideoDB result count, selected segment count, and reranking score",
    panelKind: "signoz/TablePanel",
    requestKind: "scalar",
    query: traceQuery({
      aggregations: [
        { expression: "avg(video.result_count)", alias: "Candidate results" },
        { expression: "avg(video.segment_count)", alias: "Segments selected" },
        { expression: "avg(video.relevance_score)", alias: "Relevance" },
      ],
      filter:
        "service.name = 'kathaquest' AND video.relevance_score EXISTS",
      groupBy: [traceField("video.index_type", "attribute")],
      legend: "{{video.index_type}}",
    }),
  }),
  "recent-errors": panel({
    title: "Recent pipeline errors",
    description: "Newest failed spans with trace IDs for investigation",
    panelKind: "signoz/ListPanel",
    requestKind: "raw",
    query: traceQuery({
      filter: "service.name = 'kathaquest' AND has_error = true",
      selectFields: [
        traceField("service.name", "resource"),
        traceField("name", "span"),
        traceField("duration_nano", "span", "number"),
        traceField("status_message", "span"),
        traceField("trace_id", "span"),
      ],
      limit: 25,
    }),
    pluginSpec: {
      selectFields: [
        traceField("service.name", "resource"),
        traceField("name", "span"),
        traceField("duration_nano", "span", "number"),
        traceField("status_message", "span"),
        traceField("trace_id", "span"),
      ],
    },
  }),
} satisfies Record<string, ReturnType<typeof panel>>;

const grid = [
  ["lessons-generated", 0, 0, 3, 3],
  ["lesson-p95", 3, 0, 3, 3],
  ["video-relevance", 6, 0, 3, 3],
  ["error-spans", 9, 0, 3, 3],
  ["lesson-throughput", 0, 3, 6, 7],
  ["pipeline-latency", 6, 3, 6, 7],
  ["videodb-latency", 0, 10, 12, 7],
  ["provider-usage", 0, 17, 6, 7],
  ["retrieval-quality", 6, 17, 6, 7],
  ["recent-errors", 0, 24, 12, 9],
] as const;

const dashboard = {
  schemaVersion: "v6",
  generateName: true,
  tags: [
    { key: "project", value: "kathaquest" },
    { key: "track", value: "ai-agent-observability" },
    { key: "owner", value: "kathaquest" },
  ],
  spec: {
    display: {
      name: "KathaQuest AI lesson pipeline",
      description:
        "Operational and quality signals across PDF parsing, AI lesson planning, VideoDB retrieval, storyboarding, and multilingual narration.",
    },
    variables: [],
    links: [],
    panels: dashboardPanels,
    layouts: [
      {
        kind: "Grid",
        spec: {
          items: grid.map(([id, x, y, width, height]) => ({
            x,
            y,
            width,
            height,
            content: { $ref: `#/spec/panels/${id}` },
          })),
        },
      },
    ],
  },
};

const providerPanels = {
  "voice-requests": panel({
    title: "Voice requests by provider",
    description: "Narration calls handled by each voice provider",
    panelKind: "signoz/TimeSeriesPanel",
    requestKind: "time_series",
    query: {
      ...traceQuery({
        aggregations: [{ expression: "count()" }],
        filter: "service.name = 'kathaquest' AND name = 'tts.generate'",
        groupBy: [traceField("ai.provider", "attribute")],
        legend: "{{ai.provider}}",
      }),
      stepInterval: 60,
    },
    pluginSpec: { legend: { position: "bottom" } },
  }),
  "voice-latency": panel({
    title: "Voice p95 latency",
    description: "95th-percentile narration latency by provider",
    panelKind: "signoz/TimeSeriesPanel",
    requestKind: "time_series",
    query: {
      ...traceQuery({
        aggregations: [{ expression: "p95(duration_nano)" }],
        filter: "service.name = 'kathaquest' AND name = 'tts.generate'",
        groupBy: [traceField("ai.provider", "attribute")],
        legend: "{{ai.provider}}",
      }),
      stepInterval: 60,
    },
    pluginSpec: {
      legend: { position: "bottom" },
      formatting: { unit: "ns" },
    },
  }),
  "voice-errors": panel({
    title: "Voice provider errors",
    description: "Narration spans that ended with an error",
    panelKind: "signoz/NumberPanel",
    requestKind: "scalar",
    query: traceQuery({
      aggregations: [{ expression: "count()" }],
      filter:
        "service.name = 'kathaquest' AND name = 'tts.generate' AND has_error = true",
    }),
  }),
  "voice-fallbacks": panel({
    title: "Automatic voice fallbacks",
    description: "Requests recovered by the backup voice provider",
    panelKind: "signoz/NumberPanel",
    requestKind: "scalar",
    query: traceQuery({
      aggregations: [{ expression: "count()" }],
      filter: "service.name = 'kathaquest' AND name = 'tts.fallback'",
    }),
  }),
  "voice-languages": panel({
    title: "Narration language mix",
    description: "Voice requests grouped by requested lesson language",
    panelKind: "signoz/TablePanel",
    requestKind: "scalar",
    query: traceQuery({
      aggregations: [{ expression: "count()", alias: "Requests" }],
      filter:
        "service.name = 'kathaquest' AND name = 'tts.generate' AND lesson.language EXISTS",
      groupBy: [traceField("lesson.language", "attribute")],
      legend: "{{lesson.language}}",
    }),
  }),
  "recent-provider-spans": panel({
    title: "Recent provider spans",
    description: "Newest OpenAI, VideoDB, Sarvam, and ElevenLabs operations",
    panelKind: "signoz/ListPanel",
    requestKind: "raw",
    query: traceQuery({
      filter: "service.name = 'kathaquest' AND ai.provider EXISTS",
      selectFields: [
        traceField("name", "span"),
        traceField("ai.provider", "attribute"),
        traceField("ai.model", "attribute"),
        traceField("lesson.language", "attribute"),
        traceField("duration_nano", "span", "number"),
        traceField("trace_id", "span"),
      ],
      limit: 30,
    }),
    pluginSpec: {
      selectFields: [
        traceField("name", "span"),
        traceField("ai.provider", "attribute"),
        traceField("ai.model", "attribute"),
        traceField("lesson.language", "attribute"),
        traceField("duration_nano", "span", "number"),
        traceField("trace_id", "span"),
      ],
    },
  }),
} satisfies Record<string, ReturnType<typeof panel>>;

const providerDashboard = {
  schemaVersion: "v6",
  generateName: true,
  tags: [
    { key: "project", value: "kathaquest" },
    { key: "view", value: "provider-reliability" },
  ],
  spec: {
    display: {
      name: "KathaQuest AI provider reliability",
      description:
        "Voice-provider latency, errors, fallbacks, languages, and recent AI operations.",
    },
    variables: [],
    links: [],
    panels: providerPanels,
    layouts: [
      {
        kind: "Grid",
        spec: {
          items: [
            ["voice-errors", 0, 0, 3, 3],
            ["voice-fallbacks", 3, 0, 3, 3],
            ["voice-requests", 0, 3, 6, 7],
            ["voice-latency", 6, 3, 6, 7],
            ["voice-languages", 0, 10, 5, 7],
            ["recent-provider-spans", 5, 10, 7, 9],
          ].map(([id, x, y, width, height]) => ({
            x,
            y,
            width,
            height,
            content: { $ref: `#/spec/panels/${id}` },
          })),
        },
      },
    ],
  },
};

function executionFor(panelDefinition: ReturnType<typeof panel>) {
  const query = panelDefinition.spec.queries[0];
  return {
    schemaVersion: "v1",
    start: Date.now() - 6 * 60 * 60 * 1000,
    end: Date.now(),
    requestType: query.kind,
    compositeQuery: {
      queries: [
        {
          type: "builder_query",
          spec: query.spec.plugin.spec,
        },
      ],
    },
    formatOptions: { formatTableResultForUI: false, fillGaps: false },
    variables: {},
  };
}

async function ensureDashboard(
  name: string,
  panels: Record<string, ReturnType<typeof panel>>,
  definition: JsonObject,
) {
  const existingResult = await mcpCall("signoz_list_dashboards", {
    limit: 50,
    offset: 0,
    filter: name,
  });
  const existing = parsedData(existingResult) as {
    data?: { dashboards?: Array<{ id?: string }> };
  };
  const duplicate = existing.data?.dashboards?.[0];
  if (duplicate?.id) {
    console.log(`Dashboard already exists: ${duplicate.id}`);
    return;
  }

  for (const [id, panelDefinition] of Object.entries(panels)) {
    await mcpCall("signoz_execute_builder_query", {
      query: executionFor(panelDefinition),
    });
    console.log(`Dry-run passed: ${id}`);
  }

  const created = await mcpCall(
    "signoz_create_dashboard",
    definition,
  );
  const result = parsedData(created);
  console.log(`Dashboard created: ${JSON.stringify(result)}`);
}

const alertQueries = {
  latency: {
    alert: "KathaQuest lesson generation p99 above 90 seconds",
    alertType: "TRACES_BASED_ALERT",
    description:
      "Detects sustained slow end-to-end generation in the AI lesson pipeline.",
    ruleType: "threshold_rule",
    version: "v5",
    schemaVersion: "v2alpha1",
    condition: {
      compositeQuery: {
        queryType: "builder",
        panelType: "graph",
        unit: "ns",
        queries: [
          {
            type: "builder_query",
            spec: {
              ...traceQuery({
                aggregations: [{ expression: "p99(duration_nano)" }],
                filter:
                  "service.name = 'kathaquest' AND name = 'lesson.generate'",
              }),
              stepInterval: 60,
            },
          },
        ],
      },
      selectedQueryName: "A",
    },
  },
  relevance: {
    alert: "KathaQuest VideoDB relevance below 0.55",
    alertType: "TRACES_BASED_ALERT",
    description:
      "Catches weak evidence retrieval before irrelevant clips reach a lesson.",
    ruleType: "threshold_rule",
    version: "v5",
    schemaVersion: "v2alpha1",
    condition: {
      compositeQuery: {
        queryType: "builder",
        panelType: "graph",
        queries: [
          {
            type: "builder_query",
            spec: {
              ...traceQuery({
                aggregations: [{ expression: "avg(video.relevance_score)" }],
                filter:
                  "service.name = 'kathaquest' AND video.relevance_score EXISTS",
              }),
              stepInterval: 60,
            },
          },
        ],
      },
      selectedQueryName: "A",
    },
  },
  failures: {
    alert: "KathaQuest pipeline error detected",
    alertType: "TRACES_BASED_ALERT",
    description:
      "Fires when a lesson, provider, retrieval, or narration span fails.",
    ruleType: "threshold_rule",
    version: "v5",
    schemaVersion: "v2alpha1",
    condition: {
      compositeQuery: {
        queryType: "builder",
        panelType: "graph",
        queries: [
          {
            type: "builder_query",
            spec: {
              ...traceQuery({
                aggregations: [{ expression: "count()" }],
                filter: "service.name = 'kathaquest' AND has_error = true",
              }),
              stepInterval: 60,
            },
          },
        ],
      },
      selectedQueryName: "A",
    },
  },
} as const;

async function ensureAlerts() {
  if (!webhookUrl || !webhookUsername || !webhookPassword) {
    console.log(
      "Alert setup skipped: set KATHAQUEST_ALERT_WEBHOOK_URL, SIGNOZ_WEBHOOK_USERNAME, and SIGNOZ_WEBHOOK_PASSWORD.",
    );
    return;
  }

  const channelsResult = await mcpCall("signoz_list_notification_channels", {
    limit: 100,
    offset: 0,
  });
  const channels = parsedData(channelsResult) as {
    data?: Array<{ name?: string }>;
  };
  const channelName = "kathaquest-alert-webhook";
  if (!channels.data?.some((item) => item.name === channelName)) {
    await mcpCall("signoz_create_notification_channel", {
      type: "webhook",
      name: channelName,
      webhook_url: webhookUrl,
      webhook_username: webhookUsername,
      webhook_password: webhookPassword,
      send_resolved: true,
    });
    console.log(`Notification channel created: ${channelName}`);
  }

  const existingRulesResult = await mcpCall("signoz_list_alert_rules", {
    limit: 100,
    offset: 0,
  });
  const existingRules = JSON.stringify(parsedData(existingRulesResult));

  const configurations = [
    {
      ...alertQueries.latency,
      condition: {
        ...alertQueries.latency.condition,
        thresholds: {
          kind: "basic",
          spec: [
            {
              name: "warning",
              op: "above",
              matchType: "on_average",
              target: 90,
              targetUnit: "s",
              recoveryTarget: 75,
              channels: [channelName],
            },
          ],
        },
      },
      evaluation: {
        kind: "rolling",
        spec: { evalWindow: "5m", frequency: "1m" },
      },
      notificationSettings: {
        renotify: {
          enabled: true,
          interval: "30m",
          alertStates: ["firing"],
        },
      },
      labels: {
        severity: "warning",
        team: "kathaquest",
        component: "lesson-pipeline",
      },
      annotations: {
        summary: "KathaQuest lesson generation is slow",
        description:
          "Lesson generation p99 is {{$value}} and crossed {{$threshold}}. Inspect the slowest child spans in the trace.",
      },
    },
    {
      ...alertQueries.relevance,
      condition: {
        ...alertQueries.relevance.condition,
        thresholds: {
          kind: "basic",
          spec: [
            {
              name: "warning",
              op: "below",
              matchType: "all_the_times",
              target: 0.55,
              recoveryTarget: 0.62,
              channels: [channelName],
            },
          ],
        },
      },
      evaluation: {
        kind: "rolling",
        spec: { evalWindow: "5m", frequency: "1m" },
      },
      notificationSettings: {
        renotify: {
          enabled: true,
          interval: "30m",
          alertStates: ["firing"],
        },
      },
      labels: {
        severity: "warning",
        team: "kathaquest",
        component: "videodb-retrieval",
      },
      annotations: {
        summary: "KathaQuest retrieved weak video evidence",
        description:
          "Average VideoDB relevance is {{$value}}, below {{$threshold}}. Review the retrieval query and fallback planning spans.",
      },
    },
    {
      ...alertQueries.failures,
      condition: {
        ...alertQueries.failures.condition,
        thresholds: {
          kind: "basic",
          spec: [
            {
              name: "critical",
              op: "above",
              matchType: "at_least_once",
              target: 0,
              channels: [channelName],
            },
          ],
        },
      },
      evaluation: {
        kind: "rolling",
        spec: { evalWindow: "5m", frequency: "1m" },
      },
      notificationSettings: {
        renotify: {
          enabled: true,
          interval: "15m",
          alertStates: ["firing"],
        },
      },
      labels: {
        severity: "critical",
        team: "kathaquest",
        component: "ai-orchestration",
      },
      annotations: {
        summary: "KathaQuest pipeline error detected",
        description:
          "{{$value}} errored span(s) appeared in the last five minutes. Open the trace to identify the failing provider or pipeline stage.",
      },
    },
  ];

  for (const config of configurations) {
    if (existingRules.includes(config.alert)) {
      console.log(`Alert already exists: ${config.alert}`);
      continue;
    }
    await mcpCall("signoz_create_alert", config as unknown as JsonObject);
    console.log(`Alert created: ${config.alert}`);
  }
}

await ensureDashboard(
  "KathaQuest AI lesson pipeline",
  dashboardPanels,
  dashboard as unknown as JsonObject,
);
await ensureDashboard(
  "KathaQuest AI provider reliability",
  providerPanels,
  providerDashboard as unknown as JsonObject,
);
await ensureAlerts();

export {};
