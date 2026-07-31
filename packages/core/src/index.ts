// ArchadiAgent — a from-scratch, provider-agnostic TypeScript SDK for
// building tool-using, multi-agent LLM systems.
// Built by Aditya Kumar Kushwaha.

export { Agent, AgentBuilder } from "./agent/Agent";
export type { AgentConfig, ModelTarget } from "./agent/Agent";

export { Runner } from "./runtime/Runner";
export type { RunOptions, RunResult } from "./runtime/Runner";

export { Tool, ToolBuilder, defineTool } from "./tools/Tool";
export type { ToolContext, ToolDefinition, ToolResult } from "./tools/Tool";

export {
  ProviderRegistry,
} from "./providers/ProviderRegistry";
export { OpenAIProvider } from "./providers/OpenAIProvider";
export type { OpenAIProviderConfig } from "./providers/OpenAIProvider";
export { ClaudeProvider } from "./providers/ClaudeProvider";
export type { ClaudeProviderConfig } from "./providers/ClaudeProvider";
export { GeminiProvider } from "./providers/GeminiProvider";
export type { GeminiProviderConfig } from "./providers/GeminiProvider";
export type {
  ChatMessage,
  ChatRole,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
  ToolCallRequest,
  ToolSpec,
  TokenUsage,
} from "./providers/ModelProvider";
export { withRetry, withTimeout, generateWithFallback, DEFAULT_RETRY } from "./providers/resilience";
export type { RetryConfig, FallbackTarget } from "./providers/resilience";

export {
  InMemorySessionStore,
  FileSessionStore,
} from "./memory/SessionStore";
export type { SessionStore } from "./memory/SessionStore";
export { Mem0Memory, SimpleLongTermMemory } from "./memory/LongTermMemory";
export type { LongTermMemory, Mem0MemoryConfig } from "./memory/LongTermMemory";

export {
  maxLengthGuardrail,
  blocklistGuardrail,
  piiRedactionGuardrail,
  dangerousToolGuardrail,
} from "./guardrails/Guardrail";
export type {
  InputGuardrail,
  OutputGuardrail,
  ToolGuardrail,
  GuardrailResult,
  GuardrailContext,
  ApprovalHandler,
} from "./guardrails/Guardrail";

export { Handoff, defineHandoff, HandoffGuard } from "./handoff/Handoff";
export type { HandoffConfig, HandoffTargetAgent } from "./handoff/Handoff";

export { OutputSchema, structuredOutput, z } from "./structured/OutputSchema";
export { zodToJsonSchema } from "./structured/zodToJsonSchema";

export { Tracer, Trace } from "./tracing/Tracer";
export type { Span, SpanType, TraceSummary } from "./tracing/Tracer";

export { AgentEventBus, eventBusToAsyncIterable } from "./events/AgentEvents";
export type { AgentEventMap, AgentEventName } from "./events/AgentEvents";

export * from "./errors/AgentErrors";
