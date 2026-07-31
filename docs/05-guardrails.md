# Guardrails

Three kinds of guardrail, run at three points in the loop:

| Type | Runs | Use for |
|---|---|---|
| `InputGuardrail` | once, before the loop starts | rejecting bad/oversized/malicious input |
| `ToolGuardrail` | before every tool call | blocking dangerous tool calls, requiring approval |
| `OutputGuardrail` | once, on the final answer | redacting PII, validating tone/format |

```ts
import { maxLengthGuardrail, blocklistGuardrail, piiRedactionGuardrail } from "archadi-agent";

const agent = Agent.builder()
  .name("Assistant")
  .instructions("...")
  .model(target)
  .inputGuardrail(maxLengthGuardrail(4000))
  .inputGuardrail(blocklistGuardrail(["rm -rf /"]))
  .outputGuardrail(piiRedactionGuardrail())
  .build();
```

A guardrail returns a `GuardrailResult`:

```ts
interface GuardrailResult {
  pass: boolean;
  reason?: string;
  modifiedData?: unknown;      // rewrite the input/output instead of blocking it
  requiresApproval?: boolean;  // gate on a human/approvalHandler
}
```

- `pass: false` → the run throws `GuardrailError` immediately (input/output) or the tool call is skipped with an error message fed back to the model (tool).
- `modifiedData` → the input/output is rewritten in place (e.g. PII redaction) and the run continues normally.
- `requiresApproval: true` → same approval flow as `tool.requiresApproval` (see [Tools](./03-tools.md)).

## Writing your own

```ts
import type { InputGuardrail } from "archadi-agent";

const noProfanity: InputGuardrail = {
  name: "no_profanity",
  check(input) {
    if (/badword/i.test(input)) return { pass: false, reason: "profanity detected" };
    return { pass: true };
  },
};
```

Every guardrail check is also recorded as a `guardrail` span in the trace, and emits a `guardrail_triggered` event when it blocks or modifies something.
