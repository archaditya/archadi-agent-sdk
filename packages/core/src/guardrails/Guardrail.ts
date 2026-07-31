export interface GuardrailResult {
  pass: boolean;
  reason?: string;
  /** Optionally rewrite the data flowing through the pipeline (e.g. redact PII). */
  modifiedData?: unknown;
  /** If true, the tool call may proceed only after external approval (see ApprovalRequiredError). */
  requiresApproval?: boolean;
}

export interface GuardrailContext {
  runId: string;
  agentName: string;
  sessionId?: string;
}

/** Runs before the agent loop starts, against the raw user input. */
export interface InputGuardrail {
  name: string;
  check(input: string, ctx: GuardrailContext): Promise<GuardrailResult> | GuardrailResult;
}

/** Runs after the agent produces its final answer, against that answer. */
export interface OutputGuardrail {
  name: string;
  check(output: string, ctx: GuardrailContext): Promise<GuardrailResult> | GuardrailResult;
}

/** Runs before a tool executes, against the tool name + proposed input. */
export interface ToolGuardrail {
  name: string;
  check(toolName: string, toolInput: unknown, ctx: GuardrailContext): Promise<GuardrailResult> | GuardrailResult;
}

/** Approval callback used when a guardrail or tool flags `requiresApproval`. Return true to allow. */
export type ApprovalHandler = (details: { toolName: string; input: unknown; reason?: string }) => Promise<boolean> | boolean;

// ---------------------------------------------------------------------------
// A handful of ready-made guardrails covering the most common cases.
// ---------------------------------------------------------------------------

/** Blocks input over a certain length — cheap defense against prompt-stuffing / cost blowouts. */
export function maxLengthGuardrail(maxChars: number): InputGuardrail {
  return {
    name: "max_length",
    check(input) {
      if (input.length > maxChars) {
        return { pass: false, reason: `Input exceeds ${maxChars} characters (got ${input.length}).` };
      }
      return { pass: true };
    },
  };
}

/** Blocks input containing any of the given banned substrings/patterns (case-insensitive). */
export function blocklistGuardrail(terms: string[]): InputGuardrail {
  return {
    name: "blocklist",
    check(input) {
      const lower = input.toLowerCase();
      const hit = terms.find((t) => lower.includes(t.toLowerCase()));
      if (hit) return { pass: false, reason: `Input contains a blocked term: "${hit}".` };
      return { pass: true };
    },
  };
}

/** Redacts common PII patterns (emails, and simple phone-number shapes) from the final output before it's returned. */
export function piiRedactionGuardrail(): OutputGuardrail {
  return {
    name: "pii_redaction",
    check(output) {
      const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const phoneRe = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g;
      const modified = output.replace(emailRe, "[redacted-email]").replace(phoneRe, "[redacted-phone]");
      if (modified !== output) {
        return { pass: true, modifiedData: modified, reason: "Redacted PII from output." };
      }
      return { pass: true };
    },
  };
}

/** Requires human approval before running any tool in the given (dangerous) list. */
export function dangerousToolGuardrail(dangerousToolNames: string[]): ToolGuardrail {
  return {
    name: "dangerous_tool_approval",
    check(toolName, _input) {
      if (dangerousToolNames.includes(toolName)) {
        return { pass: true, requiresApproval: true, reason: `"${toolName}" is marked as a sensitive tool.` };
      }
      return { pass: true };
    },
  };
}
