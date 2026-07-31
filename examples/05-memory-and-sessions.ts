/**
 * Memory & Sessions: multi-turn conversation within a session, plus
 * cross-session recall via long-term memory.
 *
 * Run with:  OPENAI_API_KEY=sk-... npx tsx examples/05-memory-and-sessions.ts
 */
import {
  Agent,
  InMemorySessionStore,
  OpenAIProvider,
  ProviderRegistry,
  Runner,
  SimpleLongTermMemory,
} from "archadi-agent";

async function main() {
  ProviderRegistry.instance().register(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }));
  const model = { provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" };

  const sessionStore = new InMemorySessionStore();
  const longTermMemory = new SimpleLongTermMemory();

  const agent = Agent.builder()
    .name("MemoryAgent")
    .instructions(
      "You are a helpful assistant that remembers previous conversations. " +
      "If you recall relevant facts about the user, mention them naturally."
    )
    .model(model)
    .sessionStore(sessionStore)
    .longTermMemory(longTermMemory)
    .build();

  const runner = new Runner();

  // --- Turn 1: tell the agent something ---
  console.log("--- Session A, Turn 1 ---");
  const r1 = await runner.run(agent, "Hi! My name is Aditya and I'm building an AI SDK in TypeScript.", {
    sessionId: "session-A",
    userId: "user-1",
  });
  console.log(r1.finalOutput);

  // --- Turn 2: ask within the same session (session store recalls) ---
  console.log("\n--- Session A, Turn 2 ---");
  const r2 = await runner.run(agent, "What's my name and what am I working on?", {
    sessionId: "session-A",
    userId: "user-1",
  });
  console.log(r2.finalOutput);

  // --- Turn 3: new session, same user — long-term memory should recall ---
  console.log("\n--- Session B, Turn 1 (new session, same user) ---");
  const r3 = await runner.run(agent, "Do you remember anything about me?", {
    sessionId: "session-B",
    userId: "user-1",
  });
  console.log(r3.finalOutput);

  // --- Turn 4: different user — should NOT recall ---
  console.log("\n--- Session C, Turn 1 (different user) ---");
  const r4 = await runner.run(agent, "Do you know my name?", {
    sessionId: "session-C",
    userId: "user-2",
  });
  console.log(r4.finalOutput);
}

main().catch(console.error);
