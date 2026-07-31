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

  let lastError: unknown;
  for (const target of targets) {
    try {
      const response = await withRetry(
        (attempt) =>
          withTimeout(
            () => target.provider.generate({ ...requestWithoutModel, model: target.model }),
            target.timeoutMs ?? 30_000,
            target.provider.name
          ),
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
