import { ClaudeProvider, GeminiProvider, OpenAIProvider, ProviderRegistry } from "archadi-agent";

export interface AvailableModel {
  provider: string;
  model: string;
  label: string;
}

/**
 * Registers whichever providers have API keys present in the environment.
 * Returns the list of default (provider, model) targets available so the
 * CLI can pick a sensible default and tell the user what's usable.
 */
export function registerProvidersFromEnv(): AvailableModel[] {
  const registry = ProviderRegistry.instance();
  const available: AvailableModel[] = [];

  if (process.env.OPENAI_API_KEY) {
    registry.register(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.OPENAI_BASE_URL }));
    available.push({ provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-4o-mini", label: "OpenAI" });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    registry.register(new ClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY }));
    available.push({ provider: "claude", model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5", label: "Claude" });
  }

  if (process.env.GEMINI_API_KEY) {
    registry.register(new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY }));
    available.push({ provider: "gemini", model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash", label: "Gemini" });
  }

  return available;
}
