# Tools

A tool is a typed function the model can call. Define one with `defineTool` (or the fluent `ToolBuilder`), backed by a [Zod](https://zod.dev) schema for input validation:

```ts
import { defineTool, z } from "archadi-agent";

const getWeather = defineTool({
  name: "get_weather",
  description: "Fetches current weather for a city",
  schema: z.object({ city: z.string() }),
  async execute({ city }) {
    const res = await fetch(`https://wttr.in/${city}?format=%C+%t`);
    return { city, report: await res.text() };
  },
});
```

Attach it to an agent with `.tool(...)`:

```ts
const agent = Agent.builder().name("WeatherBot").instructions("...").model(target).tool(getWeather).build();
```

## What the Runner does for you

- **Validation** — input is parsed with your Zod schema before `execute` runs; invalid input throws `ToolValidationError` and is reported back to the model as a tool error (it usually retries with corrected input) rather than crashing the run.
- **Error isolation** — if `execute` throws, the Runner catches it, wraps it in `ToolExecutionError`, and feeds the error back to the model as the tool result, so one broken tool call doesn't kill the whole run.
- **Async support** — `execute` can be sync or return a `Promise`; both work.
- **JSON-schema generation** — `tool.toJsonSchema()` (used internally) converts your Zod schema to the JSON schema every provider needs for function calling.

## Requiring approval

Mark a tool as sensitive with `requiresApproval: true`. The Runner will refuse to execute it unless the caller supplies an `approvalHandler` in `RunOptions`:

```ts
const runShell = defineTool({
  name: "run_shell_command",
  description: "Runs a shell command",
  requiresApproval: true,
  schema: z.object({ command: z.string() }),
  execute({ command }) { /* ... */ },
});

await runner.run(agent, "compile and run hello.cpp", {
  approvalHandler: async ({ toolName, input }) => {
    // e.g. prompt a human, check an allowlist, call another service...
    return toolName === "run_shell_command"; // approve
  },
});
```

The CLI wires this to an interactive `[y/N]` prompt — see [`packages/cli/src/tools/execTool.ts`](../packages/cli/src/tools/execTool.ts).

## Tool context

`execute(input, ctx)` receives a `ToolContext`:

```ts
interface ToolContext {
  runId: string;
  agentName: string;
  sessionId?: string;
  metadata: Record<string, unknown>; // whatever you passed as RunOptions.metadata
  signal?: AbortSignal;
}
```

Use `metadata` to inject request-scoped things like a user id, a database client, or an API key id — this is how the (planned) full-stack layer authenticates tool calls without global state.
