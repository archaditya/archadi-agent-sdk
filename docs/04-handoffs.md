# Handoffs (multi-agent delegation)

A `Handoff` lets one agent transfer a conversation to another agent that's better suited to it. Under the hood, a handoff is surfaced to the model as a normal tool named `transfer_to_<agent_name>` — no special model support required, this works with plain function calling on any provider.

```ts
import { Agent, defineHandoff } from "archadi-agent";

const refundAgent = Agent.builder()
  .name("RefundAgent")
  .instructions("You handle refunds empathetically.")
  .model(target)
  .build();

const router = Agent.builder()
  .name("SupportRouter")
  .instructions("Triage requests. Hand off refunds to RefundAgent.")
  .model(target)
  .handoff(defineHandoff({ agent: refundAgent, description: "Use for refund/return requests." }))
  .build();
```

`result.agentName` tells you which agent actually produced the final answer — useful for logging/analytics.

## Context transfer

By default the full input and message history carry over to the new agent — it can see everything that happened so far. If you want the target agent to start from a clean, rewritten brief instead, supply an `inputFilter`:

```ts
defineHandoff({
  agent: refundAgent,
  inputFilter: (originalInput, fullHistoryJson) => {
    return `Customer wants a refund. Original message: "${originalInput}"`;
  },
});
```

## Loop prevention

Every run tracks the chain of agents visited (`HandoffGuard`). A run throws `HandoffLoopError` if:

- the chain exceeds `agent.maxHandoffDepth` (default 8), or
- an immediate A → B → A cycle is detected (almost always a prompt-design bug, not legitimate routing)

## Visibility

Every handoff appears in the trace (`type: "handoff"`, with `fromAgent`/`toAgent`) and emits `handoff_started` / `handoff_completed` runtime events — see [Streaming & Tracing](./08-streaming-and-tracing.md).
