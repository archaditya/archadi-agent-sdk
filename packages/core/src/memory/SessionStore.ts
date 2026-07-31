import fs from "node:fs";
import path from "node:path";
import { SessionStoreError } from "../errors/AgentErrors";
import { ChatMessage } from "../providers/ModelProvider";

/**
 * SessionStore — storage abstraction for multi-turn conversation history.
 *
 * The Runner only ever talks to this interface, so a host app can swap
 * InMemorySessionStore for FileSessionStore, a Redis-backed store, a
 * SQLite-backed store, or Mem0SessionStore (semantic long-term memory)
 * without touching agent code.
 */
export interface SessionStore {
  getHistory(sessionId: string): Promise<ChatMessage[]>;
  appendMessages(sessionId: string, messages: ChatMessage[]): Promise<void>;
  clear(sessionId: string): Promise<void>;
  listSessions(): Promise<string[]>;
}

/** Default store: fast, per-process, lost on restart. Good for CLI/dev use and tests. */
export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, ChatMessage[]>();

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    return [...(this.sessions.get(sessionId) ?? [])];
  }

  async appendMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    const existing = this.sessions.get(sessionId) ?? [];
    this.sessions.set(sessionId, [...existing, ...messages]);
  }

  async clear(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async listSessions(): Promise<string[]> {
    return [...this.sessions.keys()];
  }
}

/**
 * Durable, zero-dependency store: one JSON file per process, one array per
 * session. Good default for a CLI tool people run by cloning the repo —
 * no database server required.
 */
export class FileSessionStore implements SessionStore {
  private filePath: string;
  private cache: Record<string, ChatMessage[]> | null = null;

  constructor(filePath = path.join(process.cwd(), ".archadi", "sessions.json")) {
    this.filePath = filePath;
  }

  private load(): Record<string, ChatMessage[]> {
    if (this.cache) return this.cache;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      if (fs.existsSync(this.filePath)) {
        this.cache = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      } else {
        this.cache = {};
      }
    } catch (err) {
      throw new SessionStoreError(`Failed to load session file at ${this.filePath}`, err);
    }
    return this.cache!;
  }

  private persist(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), "utf-8");
    } catch (err) {
      throw new SessionStoreError(`Failed to write session file at ${this.filePath}`, err);
    }
  }

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    const data = this.load();
    return [...(data[sessionId] ?? [])];
  }

  async appendMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    const data = this.load();
    data[sessionId] = [...(data[sessionId] ?? []), ...messages];
    this.persist();
  }

  async clear(sessionId: string): Promise<void> {
    const data = this.load();
    delete data[sessionId];
    this.persist();
  }

  async listSessions(): Promise<string[]> {
    return Object.keys(this.load());
  }
}
