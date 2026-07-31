import { ProviderError } from "../errors/AgentErrors";
import {
  ChatMessage,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
  ToolCallRequest,
} from "./ModelProvider";

export interface ClaudeProviderConfig {
  apiKey: string;
  baseUrl?: string;
  anthropicVersion?: string;
}

/**
 * Adapter for Anthropic's Messages API.
 */
export class ClaudeProvider implements ModelProvider {
  readonly name = "claude";
  private apiKey: string;
  private baseUrl: string;
  private version: string;

  constructor(config: ClaudeProviderConfig) {
    if (!config.apiKey) throw new ProviderError("ClaudeProvider requires an apiKey");
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
    this.version = config.anthropicVersion ?? "2023-06-01";
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": this.version,
    };
  }

  /** Anthropic separates the system prompt from the message list. */
  private splitSystem(messages: ChatMessage[]): { system: string; rest: ChatMessage[] } {
    const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
    const rest = messages.filter((m) => m.role !== "system");
    return { system: systemParts.join("\n\n"), rest };
  }

  private toClaudeMessages(messages: ChatMessage[]): unknown[] {
    return messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
        };
      }
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        const blocks: unknown[] = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        for (const tc of m.toolCalls) {
          blocks.push({ type: "tool_use", id: tc.callId, name: tc.toolName, input: tc.input ?? {} });
        }
        return { role: "assistant", content: blocks };
      }
      return { role: m.role, content: m.content };
    });
  }

  private buildBody(request: ModelRequest, stream: boolean) {
    const { system, rest } = this.splitSystem(request.messages);
    return {
      model: request.model,
      system: system || undefined,
      messages: this.toClaudeMessages(rest),
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      stream,
      tools: request.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    };
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(request, false)),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(`Claude request failed (${res.status}): ${body}`);
    }
    const data: any = await res.json();
    const textBlocks = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text);
    const toolCalls: ToolCallRequest[] = (data.content ?? [])
      .filter((b: any) => b.type === "tool_use")
      .map((b: any) => ({ callId: b.id, toolName: b.name, input: b.input ?? {} }));

    return {
      text: textBlocks.join(""),
      toolCalls,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      raw: data,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(request, true)),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(`Claude stream failed (${res.status}): ${body}`);
    }

    let text = "";
    const toolCalls: ToolCallRequest[] = [];
    let currentTool: { id: string; name: string; args: string } | null = null;
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    for await (const evt of readSSEEvents(res.body)) {
      if (evt.type === "content_block_start" && evt.content_block?.type === "tool_use") {
        currentTool = { id: evt.content_block.id, name: evt.content_block.name, args: "" };
      } else if (evt.type === "content_block_delta") {
        if (evt.delta?.type === "text_delta") {
          text += evt.delta.text;
          yield { type: "text_delta", delta: evt.delta.text };
        } else if (evt.delta?.type === "input_json_delta" && currentTool) {
          currentTool.args += evt.delta.partial_json ?? "";
        }
      } else if (evt.type === "content_block_stop" && currentTool) {
        const call: ToolCallRequest = {
          callId: currentTool.id,
          toolName: currentTool.name,
          input: safeJsonParse(currentTool.args),
        };
        toolCalls.push(call);
        yield { type: "tool_call", call };
        currentTool = null;
      } else if (evt.type === "message_delta" && evt.usage) {
        usage.outputTokens = evt.usage.output_tokens ?? usage.outputTokens;
      } else if (evt.type === "message_start" && evt.message?.usage) {
        usage.inputTokens = evt.message.usage.input_tokens ?? usage.inputTokens;
      }
    }
    usage.totalTokens = usage.inputTokens + usage.outputTokens;

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

async function* readSSEEvents(body: ReadableStream<Uint8Array>): AsyncIterable<any> {
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
      if (!dataLine) continue;
      try {
        yield JSON.parse(dataLine.slice(5).trim());
      } catch {
        // ignore malformed chunk
      }
    }
  }
}
