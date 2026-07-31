# Memory & Sessions

ArchadiAgent separates three layers of state:

1. **Agent configuration** — the `Agent` object itself (instructions, tools, model). Immutable, shared across every run.
2. **Current run state** — held only for the duration of one `Runner.run()` call (the in-flight `messages` array, the active agent during handoffs, the trace). Never persisted.
3. **Persistent session state** — the conversation transcript, via a `SessionStore`, keyed by `sessionId`, surviving across runs/process restarts.

## Sessions (raw transcript)

```ts
import { FileSessionStore, InMemorySessionStore } from "archadi-agent";

const sessionStore = new FileSessionStore(".archadi/sessions.json"); // zero-dependency, durable
// or: new InMemorySessionStore()                                    // fast, lost on restart

const agent = Agent.builder().name("Assistant").instructions("...").model(target).sessionStore(sessionStore).build();

await runner.run(agent, "my name is Aditya", { sessionId: "user-42" });
await runner.run(agent, "what's my name?", { sessionId: "user-42" }); // remembers, same session
```

Implement the `SessionStore` interface yourself to back it with Redis, SQLite, Postgres, etc:

```ts
interface SessionStore {
  getHistory(sessionId: string): Promise<ChatMessage[]>;
  appendMessages(sessionId: string, messages: ChatMessage[]): Promise<void>;
  clear(sessionId: string): Promise<void>;
  listSessions(): Promise<string[]>;
}
```

## Long-term memory (semantic, cross-session)

A `SessionStore` replays the *entire* transcript every run — fine for one conversation, wasteful across months of usage. `LongTermMemory` instead extracts and retrieves only what's relevant to the current message, using [mem0](https://mem0.ai):

```ts
import { Mem0Memory } from "archadi-agent";

const memory = new Mem0Memory({ apiKey: process.env.MEM0_API_KEY! }); // hosted
// or: new Mem0Memory({ mode: "local", localConfig: { /* vector store config */ } })

const agent = Agent.builder().name("Assistant").instructions("...").model(target).longTermMemory(memory).build();

await runner.run(agent, "I prefer TypeScript over Python", { userId: "aditya" });
// ... weeks later, a different session ...
await runner.run(agent, "what language should I use for this script?", { userId: "aditya" });
// -> the Runner recalls relevant facts and injects them into the system prompt automatically
```

`mem0ai` is an **optional peer dependency** — install it only if you use `Mem0Memory`:

```bash
npm install mem0ai
```

No mem0 account yet? `SimpleLongTermMemory` is a zero-setup, in-process fallback with the same interface — the CLI's `--memory` flag uses it by default.

## How the Runner uses both together

Each `run()` call:

1. Loads the session transcript (`sessionStore.getHistory`) and prepends it to the prompt.
2. Recalls relevant long-term facts (`longTermMemory.recall`) and injects them into the system message.
3. After a successful run, appends the new turn to the session store and long-term memory (`longTermMemory.remember`).


## SQLite storage

For production durability without running a separate database server, use the built-in SQLite adapter:

```bash
npm install better-sqlite3
```

```ts
import { SqliteSessionStore } from "archadi-agent";

const sessionStore = new SqliteSessionStore("./data/sessions.db");

const agent = Agent.builder()
  .name("Assistant")
  .instructions("...")
  .model(target)
  .sessionStore(sessionStore)
  .build();
```

The SQLite store auto-creates the database file and table on first use, uses WAL mode for performance, and wraps batch writes in transactions. Call sessionStore.close() during graceful shutdown.


## Custom storage adapters
Implement the SessionStore interface to back sessions with Redis, Postgres, DynamoDB, or anything else:

```ts
class RedisSessionStore implements SessionStore {
  async getHistory(sessionId: string): Promise<ChatMessage[]> { /* ... */ }
  async appendMessages(sessionId: string, messages: ChatMessage[]): Promise<void> { /* ... */ }
  async clear(sessionId: string): Promise<void> { /* ... */ }
  async listSessions(): Promise<string[]> { /* ... */ }
}
```

---