import { ProviderError } from "../errors/AgentErrors";
import {
  ChatMessage,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
  ToolCallRequest,
} from "./ModelProvider";

export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
}

/**
 * Adapter for OpenAI's Chat Completions API. Only this file knows about
 * OpenAI's wire format — everything above the provider boundary speaks the
 * neutral ModelRequest / ModelResponse dialect.
 */
export class OpenAIProvider implements ModelProvider {
  readonly name = "openai";
  private apiKey: string;
  private baseUrl: string;
  private organization?: string;

  constructor(config: OpenAIProviderConfig) {
    if (!config.apiKey) throw new ProviderError("OpenAIProvider requires an apiKey");
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
    this.organization = config.organization;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (this.organization) h["OpenAI-Organization"] = this.organization;
    return h;
  }

  private toOpenAIMessages(messages: ChatMessage[]): unknown[] {
    return messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
      }
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.callId,
            type: "function",
            function: { name: tc.toolName, arguments: JSON.stringify(tc.input ?? {}) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  private buildBody(request: ModelRequest, stream: boolean) {
    return {
      model: request.model,
      messages: this.toOpenAIMessages(request.messages),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stream,
      tools: request.tools?.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      response_format: request.responseSchema
        ? { type: "json_schema", json_schema: { name: "structured_output", schema: request.responseSchema, strict: true } }
        : undefined,
    };
  }

  private parseToolCalls(rawCalls: unknown): ToolCallRequest[] {
    if (!Array.isArray(rawCalls)) return [];
    return rawCalls.map((c: any) => ({
      callId: c.id,
      toolName: c.function?.name,
      input: safeJsonParse(c.function?.arguments),
    }));
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(request, false)),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(`OpenAI request failed (${res.status}): ${body}`);
    }
    const data: any = await res.json();
    const choice = data.choices?.[0];
    return {
      text: choice?.message?.content ?? "",
      toolCalls: this.parseToolCalls(choice?.message?.tool_calls),
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      raw: data,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(request, true)),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(`OpenAI stream failed (${res.status}): ${body}`);
    }

    let text = "";
    const toolCallsById = new Map<string, { name: string; args: string }>();
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    for await (const line of readSSELines(res.body)) {
      if (line === "[DONE]") break;
      let json: any;
      try {
        json = JSON.parse(line);
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta;
      if (delta?.content) {
        text += delta.content;
        yield { type: "text_delta", delta: delta.content };
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallsById.get(tc.id ?? tc.index?.toString() ?? "0") ?? { name: "", args: "" };
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
          toolCallsById.set(tc.id ?? tc.index?.toString() ?? "0", existing);
        }
      }
      if (json.usage) {
        usage.inputTokens = json.usage.prompt_tokens ?? usage.inputTokens;
        usage.outputTokens = json.usage.completion_tokens ?? usage.outputTokens;
        usage.totalTokens = json.usage.total_tokens ?? usage.totalTokens;
      }
    }

    const toolCalls: ToolCallRequest[] = [];
    for (const [id, tc] of toolCallsById.entries()) {
      const call: ToolCallRequest = { callId: id, toolName: tc.name, input: safeJsonParse(tc.args) };
      toolCalls.push(call);
      yield { type: "tool_call", call };
    }

    yield { type: "done", response: { text, toolCalls, usage } };
  }
}

function safeJsonParse(s: unknown): unknown {
  if (typeof s !== "string" || s.length === 0) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

async function* readSSELines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
      if (dataLine) yield dataLine.slice(5).trim();
    }
  }
}
