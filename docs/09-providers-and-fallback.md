# Model Providers & Fallback

ArchadiAgent never talks to a vendor SDK directly — everything goes through the `ModelProvider` interface (`providers/ModelProvider.ts`):

```ts
interface ModelProvider {
  readonly name: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
}
```

Three adapters ship out of the box, each translating to/from the vendor's real wire format:

```ts
import { OpenAIProvider, ClaudeProvider, GeminiProvider, ProviderRegistry } from "archadi-agent";

const registry = ProviderRegistry.instance(); // singleton — register once, use everywhere
registry.register(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }));
registry.register(new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY! }));
registry.register(new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY! }));
```

An agent references a provider by name, decoupling "which model" from "which agent":

```ts
Agent.builder().model({ provider: "claude", model: "claude-sonnet-5" })
```

## Writing your own provider

Implement the interface and register it — the Runner doesn't care:

```ts
class MyLocalLlamaProvider implements ModelProvider {
  readonly name = "local-llama";
  async generate(request) { /* call your local server */ }
  async *stream(request) { /* yield text_delta / tool_call / done */ }
}
registry.register(new MyLocalLlamaProvider());
```

## Retries, timeouts, fallback chains

```ts
Agent.builder()
  .model({ provider: "openai", model: "gpt-4o-mini", timeoutMs: 20_000 })
  .fallbackModel({ provider: "claude", model: "claude-sonnet-5" })
  .fallbackModel({ provider: "gemini", model: "gemini-2.0-flash" })
  .build();
```

Each turn tries the primary target first, with exponential-backoff retries (`DEFAULT_RETRY`: 3 attempts, 300ms base delay, jittered). If it still fails, the Runner moves to the next fallback target and repeats — see `generateWithFallback` in `providers/resilience.ts`. Every retry emits a `retry` event and a `retry` trace span.

Override the retry budget per target:

```ts
.model({ provider: "openai", model: "gpt-4o-mini", retry: { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 8000 } })
```
