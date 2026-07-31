import { ProviderError } from "../errors/AgentErrors";
import { ChatMessage, ModelProvider, ModelRequest, ModelResponse, ModelStreamEvent, ToolCallRequest } from "./ModelProvider";

export interface GeminiProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Adapter for Google's Gemini generateContent API.
 * Streaming is implemented by polling the non-streaming endpoint's
 * streamGenerateContent variant and reading newline-delimited JSON chunks.
 */
export class GeminiProvider implements ModelProvider {
  readonly name = "gemini";
  private apiKey: string;
  private baseUrl: string;

  constructor(config: GeminiProviderConfig) {
    if (!config.apiKey) throw new ProviderError("GeminiProvider requires an apiKey");
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  }

  private splitSystem(messages: ChatMessage[]): { system: string; rest: ChatMessage[] } {
    const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
    return { system: systemParts.join("\n\n"), rest: messages.filter((m) => m.role !== "system") };
  }

  private toGeminiContents(messages: ChatMessage[]): unknown[] {
    return messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "function",
          parts: [{ functionResponse: { name: m.toolName, response: { result: m.content } } }],
        };
      }
      if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: "model",
          parts: m.toolCalls.map((tc) => ({ functionCall: { name: tc.toolName, args: tc.input ?? {} } })),
        };
      }
      return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
    });
  }

  private buildBody(request: ModelRequest) {
    const { system, rest } = this.splitSystem(request.messages);
    return {
      contents: this.toGeminiContents(rest),
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens,
        responseMimeType: request.responseSchema ? "application/json" : undefined,
        responseSchema: request.responseSchema,
      },
      tools: request.tools?.length
        ? [{ functionDeclarations: request.tools.map((t) => ({ name: t.name, description: t.description, parameters: sanitizeForGemini(t.parameters) })) }]
        : undefined,
    };
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const url = `${this.baseUrl}/models/${request.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildBody(request)),
      signal: request.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(`Gemini request failed (${res.status}): ${body}`);
    }
    const data: any = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
    const toolCalls: ToolCallRequest[] = parts
      .filter((p: any) => p.functionCall)
      .map((p: any, i: number) => ({ callId: `gemini_call_${i}`, toolName: p.functionCall.name, input: p.functionCall.args ?? {} }));

    return {
      text,
      toolCalls,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
      raw: data,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const url = `${this.baseUrl}/models/${request.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildBody(request)),
      signal: request.signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(`Gemini stream failed (${res.status}): ${body}`);
    }

    let text = "";
    const toolCalls: ToolCallRequest[] = [];
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const reader = res.body.getReader();
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
        let chunk: any;
        try {
          chunk = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue;
        }
        const chunkParts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const p of chunkParts) {
          if (p.text) {
            text += p.text;
            yield { type: "text_delta", delta: p.text };
          }
          if (p.functionCall) {
            const call: ToolCallRequest = {
              callId: `gemini_call_${toolCalls.length}`,
              toolName: p.functionCall.name,
              input: p.functionCall.args ?? {},
            };
            toolCalls.push(call);
            yield { type: "tool_call", call };
          }
        }
        if (chunk.usageMetadata) {
          usage.inputTokens = chunk.usageMetadata.promptTokenCount ?? usage.inputTokens;
          usage.outputTokens = chunk.usageMetadata.candidatesTokenCount ?? usage.outputTokens;
          usage.totalTokens = chunk.usageMetadata.totalTokenCount ?? usage.totalTokens;
        }
      }
    }

    yield { type: "done", response: { text, toolCalls, usage } };
  }
}

function sanitizeForGemini(schema: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== "object") return schema;
  const clone = JSON.parse(JSON.stringify(schema));
  cleanObject(clone);
  return clone;
}

function cleanObject(obj: any): void {
  if (!obj || typeof obj !== "object") return;
  delete obj.additionalProperties;
  delete obj.$schema;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "object") {
      cleanObject(obj[key]);
    }
  }
}
