import { ConfigurationError, SessionStoreError } from "../errors/AgentErrors";
import { ChatMessage } from "../providers/ModelProvider";

/**
 * LongTermMemory — semantic, cross-session memory. This is a different
 * concern from SessionStore (which just replays raw transcript for one
 * conversation): a LongTermMemory extracts durable facts ("user prefers
 * TypeScript", "user's project is called archadiLM") and lets the Runner
 * retrieve only what's relevant to the current turn, keeping prompts small
 * even after months of usage.
 */
export interface LongTermMemory {
  /** Store facts extracted from a completed turn, scoped to a user. */
  remember(userId: string, messages: ChatMessage[]): Promise<void>;
  /** Retrieve the memories most relevant to the current query. */
  recall(userId: string, query: string, limit?: number): Promise<string[]>;
  /** Wipe everything stored for a user. */
  forget(userId: string): Promise<void>;
}

export interface Mem0MemoryConfig {
  apiKey?: string;
  /** Use Mem0's hosted platform ("hosted") or a locally-run OSS instance ("local"). */
  mode?: "hosted" | "local";
  /** Extra config forwarded to the mem0ai client (vector store, llm config, etc) for local mode. */
  localConfig?: Record<string, unknown>;
}

/**
 * Adapter over the `mem0ai` package. `mem0ai` is an optional peer
 * dependency — it's only `require()`d the first time this class is used,
 * so projects that don't need long-term memory never pay for it.
 *
 * npm install mem0ai
 */
export class Mem0Memory implements LongTermMemory {
  private clientPromise: Promise<any> | null = null;
  private config: Mem0MemoryConfig;

  constructor(config: Mem0MemoryConfig = {}) {
    this.config = config;
    if (config.mode !== "local" && !config.apiKey) {
      throw new ConfigurationError("Mem0Memory in hosted mode requires an apiKey (or pass mode: 'local').");
    }
  }

  private async getClient(): Promise<any> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        let mem0mod: any;
        try {
          // Dynamic require keeps mem0ai fully optional at the package.json level.
          mem0mod = await import("mem0ai");
        } catch (err) {
          throw new ConfigurationError(
            'Mem0Memory requires the "mem0ai" package. Install it with `npm install mem0ai`.'
          );
        }
        if (this.config.mode === "local") {
          const { Memory } = mem0mod;
          return new Memory(this.config.localConfig ?? {});
        }
        const { MemoryClient } = mem0mod;
        return new MemoryClient({ apiKey: this.config.apiKey });
      })();
    }
    return this.clientPromise;
  }

  async remember(userId: string, messages: ChatMessage[]): Promise<void> {
    try {
      const client = await this.getClient();
      const payload = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));
      if (payload.length === 0) return;
      await client.add(payload, { user_id: userId });
    } catch (err) {
      throw new SessionStoreError(`Mem0Memory.remember failed for user ${userId}`, err);
    }
  }

  async recall(userId: string, query: string, limit = 5): Promise<string[]> {
    try {
      const client = await this.getClient();
      const results = await client.search(query, { user_id: userId, limit });
      const items: any[] = Array.isArray(results) ? results : results?.results ?? [];
      return items.map((r) => r.memory ?? r.text ?? JSON.stringify(r)).filter(Boolean);
    } catch (err) {
      throw new SessionStoreError(`Mem0Memory.recall failed for user ${userId}`, err);
    }
  }

  async forget(userId: string): Promise<void> {
    try {
      const client = await this.getClient();
      if (typeof client.deleteAll === "function") {
        await client.deleteAll({ user_id: userId });
      }
    } catch (err) {
      throw new SessionStoreError(`Mem0Memory.forget failed for user ${userId}`, err);
    }
  }
}

/** In-memory fallback that mimics Mem0's add/search shape without any external service — used in tests and as a zero-setup default. */
export class SimpleLongTermMemory implements LongTermMemory {
  private store = new Map<string, string[]>();

  async remember(userId: string, messages: ChatMessage[]): Promise<void> {
    const facts = messages.filter((m) => m.role === "user").map((m) => m.content);
    const existing = this.store.get(userId) ?? [];
    this.store.set(userId, [...existing, ...facts].slice(-200));
  }

  async recall(userId: string, query: string, limit = 5): Promise<string[]> {
    const facts = this.store.get(userId) ?? [];
    const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const scored = facts.map((f) => ({
      fact: f,
      score: queryWords.reduce((acc, w) => acc + (f.toLowerCase().includes(w) ? 1 : 0), 0),
    }));
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .filter((s) => s.score > 0)
      .map((s) => s.fact);
  }

  async forget(userId: string): Promise<void> {
    this.store.delete(userId);
  }
}
