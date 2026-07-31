# Streaming & Tracing

## Real token-by-token streaming

`runner.runStream(agent, input, options)` returns immediately with an async-iterable event stream, plus a promise for the final result (same shape as `runner.run()`). Text deltas arrive in real-time as the model generates tokens — the Runner calls `provider.stream()` under the hood for genuine token-level delivery, not buffered chunks:

```ts
const { events, result } = runner.runStream(agent, "tell me a story");

for await (const evt of events) {
  switch (evt.type) {
    case "text_delta":         process.stdout.write((evt.payload as any).delta); break;
    case "tool_started":       console.log("calling", (evt.payload as any).toolName); break;
    case "tool_completed":     console.log("tool done"); break;
    case "handoff_started":    console.log("handing off..."); break;
    case "guardrail_triggered":console.log("guardrail tripped"); break;
    case "retry":               console.log("retrying provider call"); break;
    case "run_completed":      break;
    case "run_failed":         break;
  }
}

const final = await result; // fully resolved RunResult
```

Full event catalogue (`AgentEventMap` in `events/AgentEvents.ts`): `run_started`, `text_delta`, `tool_started`, `tool_completed`, `tool_failed`, `guardrail_triggered`, `handoff_started`, `handoff_completed`, `retry`, `run_completed`, `run_failed`.

You can also subscribe directly to a typed `AgentEventBus` if you're building the loop yourself (`bus.on("tool_started", cb)`), or `bus.onAny(cb)` for everything.

## Tracing

Every `run()`/`runStream()` call creates a `Trace` (via the singleton `Tracer`), recording a span for every model call, tool call, handoff, retry, and guardrail check, each with timing:

```ts
const result = await runner.run(agent, "...");
console.log(result.trace.toPrettyString());
```

```
Trace 3e1b... — agent "RouterAgent" — completed
  total time: 2140ms
  tokens: in=812 out=134 total=946
  [model_call] turn_1 (610ms)
  [handoff] RouterAgent -> WeatherAgent (0ms)
  [model_call] turn_2 (540ms)
  [tool_call] get_weather (612ms)
  [model_call] turn_3 (378ms)
```

Or pull the raw JSON for shipping to a logging backend:

```ts
result.trace.toJSON(); // { runId, agentName, status, spans: [...], totalTokenUsage, finalOutput, ... }

Tracer.instance().onFinish((trace) => sendToDatadog(trace)); // subscribe to every finished trace, process-wide
```

The CLI exposes this via `/trace` (toggle) or `archadi chat --trace`.
