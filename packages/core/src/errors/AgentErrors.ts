/**
 * ArchadiAgent — Error hierarchy.
 *
 * Every error the SDK throws extends AgentSDKError so consumers can do a
 * single `instanceof AgentSDKError` check, or narrow to a specific subtype
 * for granular handling.
 */

export class AgentSDKError extends Error {
  public readonly code: string;
  public readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProviderError extends AgentSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, "PROVIDER_ERROR", cause);
  }
}

export class ProviderTimeoutError extends AgentSDKError {
  constructor(providerName: string, timeoutMs: number) {
    super(`Provider "${providerName}" timed out after ${timeoutMs}ms`, "PROVIDER_TIMEOUT");
  }
}

export class ToolExecutionError extends AgentSDKError {
  public readonly toolName: string;

  constructor(toolName: string, message: string, cause?: unknown) {
    super(`Tool "${toolName}" failed: ${message}`, "TOOL_EXECUTION_ERROR", cause);
    this.toolName = toolName;
  }
}

export class ToolValidationError extends AgentSDKError {
  public readonly toolName: string;

  constructor(toolName: string, message: string, cause?: unknown) {
    super(`Tool "${toolName}" received invalid input: ${message}`, "TOOL_VALIDATION_ERROR", cause);
    this.toolName = toolName;
  }
}

export class GuardrailError extends AgentSDKError {
  public readonly guardrailName: string;
  public readonly stage: "input" | "output" | "tool";

  constructor(guardrailName: string, stage: "input" | "output" | "tool", message: string) {
    super(`Guardrail "${guardrailName}" (${stage}) blocked execution: ${message}`, "GUARDRAIL_TRIPPED");
    this.guardrailName = guardrailName;
    this.stage = stage;
  }
}

export class ApprovalRequiredError extends AgentSDKError {
  public readonly toolName: string;

  constructor(toolName: string) {
    super(`Tool "${toolName}" requires human approval before it can run`, "APPROVAL_REQUIRED");
    this.toolName = toolName;
  }
}

export class MaxTurnsExceededError extends AgentSDKError {
  constructor(maxTurns: number) {
    super(`Agent loop exceeded the maximum of ${maxTurns} turns without a final answer`, "MAX_TURNS_EXCEEDED");
  }
}

export class HandoffLoopError extends AgentSDKError {
  constructor(chain: string[]) {
    super(`Handoff loop detected: ${chain.join(" -> ")}`, "HANDOFF_LOOP");
  }
}

export class HandoffNotFoundError extends AgentSDKError {
  constructor(name: string) {
    super(`Handoff target agent "${name}" is not registered on the source agent`, "HANDOFF_NOT_FOUND");
  }
}

export class StructuredOutputError extends AgentSDKError {
  public readonly issues: unknown;

  constructor(message: string, issues: unknown) {
    super(`Structured output validation failed: ${message}`, "STRUCTURED_OUTPUT_ERROR");
    this.issues = issues;
  }
}

export class SessionStoreError extends AgentSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, "SESSION_STORE_ERROR", cause);
  }
}

export class ConfigurationError extends AgentSDKError {
  constructor(message: string) {
    super(message, "CONFIGURATION_ERROR");
  }
}
