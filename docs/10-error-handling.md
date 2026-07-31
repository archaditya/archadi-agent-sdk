# Error Handling

Every error the SDK throws extends `AgentSDKError` (`code`, `message`, optional `cause`), so you can catch broadly or narrow to a specific type:

| Error | Thrown when |
|---|---|
| `ProviderError` | a model provider's HTTP call failed |
| `ProviderTimeoutError` | a provider call exceeded its `timeoutMs` |
| `ToolExecutionError` | a tool's `execute` threw |
| `ToolValidationError` | tool input failed Zod validation |
| `GuardrailError` | an input/output guardrail returned `pass: false` |
| `ApprovalRequiredError` | a tool needs approval but no `approvalHandler` was supplied |
| `MaxTurnsExceededError` | the loop hit `agent.maxTurns` without a final answer |
| `HandoffLoopError` | handoff chain exceeded `maxHandoffDepth` or cycled |
| `HandoffNotFoundError` | (reserved) referenced handoff target doesn't exist |
| `StructuredOutputError` | final output didn't match `outputSchema` after repair attempts |
| `SessionStoreError` | a `SessionStore`/`LongTermMemory` read or write failed |
| `ConfigurationError` | an `Agent`/provider was misconfigured (missing name, missing API key, etc) |

```ts
import { AgentSDKError, GuardrailError, MaxTurnsExceededError } from "archadi-agent";

try {
  await runner.run(agent, userInput);
} catch (err) {
  if (err instanceof GuardrailError) {
    // input/output was rejected — safe to show err.message to the user
  } else if (err instanceof MaxTurnsExceededError) {
    // the agent got stuck in a tool-calling loop — log and alert
  } else if (err instanceof AgentSDKError) {
    // catch-all for anything else the SDK threw
  } else {
    throw err; // unexpected — don't swallow it
  }
}
```

## Safe failure by design

- A **tool** throwing never crashes the run — it's caught, wrapped, and fed back to the model as a tool error so it can retry or explain the failure.
- A **provider** failing retries with backoff, then falls through the fallback chain, before the run ultimately fails.
- Every failure still produces a `Trace` (`status: "failed"`, with the error recorded) and a `run_failed` event — nothing fails silently.
- API keys are read only from environment variables / explicit config objects passed by the host app; the SDK never logs them and only ever sends them in the `Authorization`/`x-api-key` header of the relevant provider's request.
