import { ProviderError, ProviderTimeoutError } from "../errors/AgentErrors";
import { ModelProvider, ModelRequest, ModelResponse } from "./ModelProvider";

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryConfig = { maxAttempts: 3, baseDelayMs: 300, maxDelayMs: 4000 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs `fn`, aborting with a ProviderTimeoutError if it doesn't settle in time. */
export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, providerName: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderTimeoutError(providerName, timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Exponential backoff retry with jitter. Calls `onRetry` before each retry attempt. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY,
  onRetry?: (attempt: number, maxAttempts: number, error: unknown) => void
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt === config.maxAttempts) break;
      onRetry?.(attempt, config.maxAttempts, err);
      const delay = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** (attempt - 1));
      const jitter = delay * (0.5 + Math.random() * 0.5);
      await sleep(jitter);
    }
  }
  throw lastError;
}

/**
 * Model fallback chain: tries a primary (provider, model) pair, and falls
 * back through an ordered list of alternates if it fails after retries.
 * Each entry gets its own retry budget and timeout.
 */
export interface FallbackTarget {
  provider: ModelProvider;
  model: string;
  timeoutMs?: number;
  retry?: RetryConfig;
}

export async function generateWithFallback(
  targets: FallbackTarget[],
  requestWithoutModel: Omit<ModelRequest, "model">,
  onRetry?: (providerName: string, attempt: number, maxAttempts: number, error: unknown) => void
): Promise<{ response: ModelResponse; usedProvider: string; usedModel: string }> {
  if (targets.length === 0) throw new ProviderError("generateWithFallback called with an empty target list");
  const signal = requestWithoutModel.signal;

  let lastError: unknown;
  for (const target of targets) {
    if (signal?.aborted) throw new ProviderError("Run was aborted");
    try {
      const response = await withRetry(
        (attempt) => {
          if (signal?.aborted) throw new ProviderError("Run was aborted");
          return withTimeout(
            () => target.provider.generate({ ...requestWithoutModel, model: target.model }),
            target.timeoutMs ?? 30_000,
            target.provider.name
          );
        },
        target.retry ?? DEFAULT_RETRY,
        (attempt, max, err) => onRetry?.(target.provider.name, attempt, max, err)
      );
      return { response, usedProvider: target.provider.name, usedModel: target.model };
    } catch (err) {
      lastError = err;
      continue; // try next fallback target
    }
  }
  throw new ProviderError(
    `All ${targets.length} model fallback target(s) failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    lastError
  );
}

/**
 * Streaming variant of generateWithFallback. Iterates through fallback
 * targets, calling `provider.stream()` on each until one succeeds.
 * Emits text deltas in real-time via the `onDelta` callback.
 *
 * Unlike generateWithFallback, this does NOT retry within a single target
 * once streaming has started — retrying a half-streamed response would
 * produce duplicate content on the consumer side. It only falls back to
 * the next target on failure.
 */
export async function streamWithFallback(
  targets: FallbackTarget[],
  requestWithoutModel: Omit<ModelRequest, "model">,
  onDelta: (delta: string) => void,
  onRetry?: (providerName: string, attempt: number, maxAttempts: number, error: unknown) => void
): Promise<{ response: ModelResponse; usedProvider: string; usedModel: string }> {
  if (targets.length === 0) throw new ProviderError("streamWithFallback called with an empty target list");
  const signal = requestWithoutModel.signal;

  let lastError: unknown;
  for (const target of targets) {
    if (signal?.aborted) throw new ProviderError("Run was aborted");
    try {
      const fullRequest: ModelRequest = { ...requestWithoutModel, model: target.model };
      let finalResponse: ModelResponse | null = null;

      const consumeStream = async (): Promise<ModelResponse> => {
        for await (const event of target.provider.stream(fullRequest)) {
          if (signal?.aborted) throw new ProviderError("Run was aborted");
          if (event.type === "text_delta") {
            onDelta(event.delta);
          } else if (event.type === "done") {
            finalResponse = event.response;
          }
          // tool_call events are part of the done response — no action needed here
        }
        if (!finalResponse) {
          throw new ProviderError(`Provider "${target.provider.name}" stream ended without a done event`);
        }
        return finalResponse;
      };

      const response = await withTimeout(
        consumeStream,
        target.timeoutMs ?? 60_000, // streaming gets a longer default timeout
        target.provider.name
      );
      return { response, usedProvider: target.provider.name, usedModel: target.model };
    } catch (err) {
      lastError = err;
      continue; // try next fallback target
    }
  }
  throw new ProviderError(
    `All ${targets.length} streaming target(s) failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    lastError
  );
}
