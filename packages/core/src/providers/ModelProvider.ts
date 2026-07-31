/**
 * Provider-agnostic message / tool / response shapes.
 *
 * Every concrete provider (OpenAI, Claude, Gemini, or a custom one you
 * write) speaks this common dialect. The Runner never imports a
 * provider-specific SDK directly — it only depends on this interface.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCallRequest {
  callId: string;
  toolName: string;
  input: unknown;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Present on assistant messages that requested tool calls. */
  toolCalls?: ToolCallRequest[];
  /** Present on tool-role messages: which call this result answers. */
  toolCallId?: string;
  /** Present on tool-role messages: the tool that produced this content. */
  toolName?: string;
  name?: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON-schema describing the tool's input. */
  parameters: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ModelRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** If set, ask the provider to constrain output to this JSON schema. */
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelResponse {
  /** Plain assistant text, if any was produced. */
  text: string;
  /** Zero or more tool calls the model wants executed. */
  toolCalls: ToolCallRequest[];
  usage: TokenUsage;
  /** Raw provider payload, kept for debugging/tracing — never relied on by the Runner. */
  raw?: unknown;
}

export type ModelStreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; call: ToolCallRequest }
  | { type: "done"; response: ModelResponse };

/**
 * Implement this interface to plug any LLM provider into ArchadiAgent.
 * The SDK ships adapters for OpenAI, Claude and Gemini — all optional,
 * all swappable, none hard-wired into the runtime.
 */
export interface ModelProvider {
  readonly name: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
}
