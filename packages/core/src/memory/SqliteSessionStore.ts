import { SessionStoreError } from "../errors/AgentErrors";
import { ChatMessage } from "../providers/ModelProvider";
import type { SessionStore } from "./SessionStore";

/**
 * SqliteSessionStore — durable session storage backed by SQLite via
 * `better-sqlite3`. The database file persists across process restarts,
 * giving you durable conversation history with zero infrastructure.
 *
 * `better-sqlite3` is an optional peer dependency — it's only loaded the
 * first time this class is used, so projects that don't need SQLite never
 * pay for it.
 *
 * ```bash
 * npm install better-sqlite3
 * ```
 */
export class SqliteSessionStore implements SessionStore {
  private db: any = null;
  private dbPath: string;

  constructor(dbPath = "archadi_sessions.db") {
    this.dbPath = dbPath;
  }

  private ensureDb(): any {
    if (this.db) return this.db;
    let Database: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      Database = require("better-sqlite3");
    } catch {
      throw new SessionStoreError(
        'SqliteSessionStore requires the "better-sqlite3" package. Install it with `npm install better-sqlite3`.'
      );
    }
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_call_id TEXT,
        tool_name TEXT,
        tool_calls TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
    `);
    return this.db;
  }

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    try {
      const db = this.ensureDb();
      const rows: any[] = db
        .prepare("SELECT role, content, tool_call_id, tool_name, tool_calls FROM sessions WHERE session_id = ? ORDER BY id ASC")
        .all(sessionId);
      return rows.map((row) => {
        const msg: ChatMessage = { role: row.role, content: row.content };
        if (row.tool_call_id) msg.toolCallId = row.tool_call_id;
        if (row.tool_name) msg.toolName = row.tool_name;
        if (row.tool_calls) {
          try {
            msg.toolCalls = JSON.parse(row.tool_calls);
          } catch {
            /* ignore malformed JSON */
          }
        }
        return msg;
      });
    } catch (err) {
      if (err instanceof SessionStoreError) throw err;
      throw new SessionStoreError(`SqliteSessionStore.getHistory failed for session "${sessionId}"`, err);
    }
  }

  async appendMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    try {
      const db = this.ensureDb();
      const insert = db.prepare(
        "INSERT INTO sessions (session_id, role, content, tool_call_id, tool_name, tool_calls) VALUES (?, ?, ?, ?, ?, ?)"
      );
      const batch = db.transaction((msgs: ChatMessage[]) => {
        for (const msg of msgs) {
          insert.run(
            sessionId,
            msg.role,
            msg.content,
            msg.toolCallId ?? null,
            msg.toolName ?? null,
            msg.toolCalls ? JSON.stringify(msg.toolCalls) : null
          );
        }
      });
      batch(messages);
    } catch (err) {
      if (err instanceof SessionStoreError) throw err;
      throw new SessionStoreError(`SqliteSessionStore.appendMessages failed for session "${sessionId}"`, err);
    }
  }

  async clear(sessionId: string): Promise<void> {
    try {
      const db = this.ensureDb();
      db.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);
    } catch (err) {
      if (err instanceof SessionStoreError) throw err;
      throw new SessionStoreError(`SqliteSessionStore.clear failed for session "${sessionId}"`, err);
    }
  }

  async listSessions(): Promise<string[]> {
    try {
      const db = this.ensureDb();
      const rows: any[] = db.prepare("SELECT DISTINCT session_id FROM sessions ORDER BY MIN(id) ASC").all();
      return rows.map((row) => row.session_id);
    } catch (err) {
      if (err instanceof SessionStoreError) throw err;
      throw new SessionStoreError("SqliteSessionStore.listSessions failed", err);
    }
  }

  /** Closes the underlying database connection. Call during graceful shutdown. */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
