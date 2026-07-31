import { ConfigurationError } from "../errors/AgentErrors";
import { ModelProvider } from "./ModelProvider";

/**
 * ProviderRegistry — classic Singleton.
 *
 * There is exactly one registry per process (`ProviderRegistry.instance()`).
 * It decouples "which providers exist" from "which agent uses which
 * provider", so a host application (e.g. the ArchadiAgent web platform)
 * can register OpenAI/Claude/Gemini/custom providers once at startup and
 * every agent simply refers to them by name.
 */
export class ProviderRegistry {
  private static _instance: ProviderRegistry | null = null;
  private providers = new Map<string, ModelProvider>();

  private constructor() {}

  static instance(): ProviderRegistry {
    if (!ProviderRegistry._instance) {
      ProviderRegistry._instance = new ProviderRegistry();
    }
    return ProviderRegistry._instance;
  }

  /** Mainly for tests: reset the singleton to a clean slate. */
  static resetForTests(): void {
    ProviderRegistry._instance = null;
  }

  register(provider: ModelProvider): this {
    this.providers.set(provider.name, provider);
    return this;
  }

  get(name: string): ModelProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ConfigurationError(
        `No model provider registered under name "${name}". Registered providers: [${[...this.providers.keys()].join(", ") || "none"}]`
      );
    }
    return provider;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  list(): string[] {
    return [...this.providers.keys()];
  }
}
