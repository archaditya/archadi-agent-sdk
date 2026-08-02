# archadi-agent

> **A provider-agnostic, high-performance TypeScript SDK for building tool-using, multi-agent LLM systems with safety guardrails, memory, structured output, and tracing.**

[![npm version](https://img.shields.io/npm/v/archadi-agent.svg)](https://www.npmjs.com/package/archadi-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Built from first principles by **Aditya Kumar Kushwaha**.

- 📖 **Documentation & Live Portal:** [ai-agent-sdk.archadi.dev](https://ai-agent-sdk.archadi.dev)
- 🐙 **GitHub Repository:** [github.com/archaditya/archadi-agent-sdk](https://github.com/archaditya/archadi-agent-sdk)

---

## Features

- 🛠️ **Provider Agnostic:** Native support for **OpenAI**, **Anthropic Claude**, and **Google Gemini** with automatic exponential backoff retries and fallback chains.
- 🤝 **Multi-Agent Handoffs:** Delegate tasks between specialized agents with `HandoffGuard` loop prevention (prevents infinite A → B → A cycles).
- 🛡️ **Safety Guardrails:** Multi-stage execution safety (`InputGuardrail`, `ToolGuardrail`, `OutputGuardrail`) plus human approval gates (`requiresApproval`) and LLM content moderation.
- 💾 **State & Memory:** Multi-turn session persistence via `InMemorySessionStore`, `FileSessionStore`, or `SqliteSessionStore` (WAL mode), plus semantic long-term memory via [mem0](https://mem0.ai).
- 📐 **Structured Outputs:** Zod schema-backed structured outputs with automatic LLM repair retries.
- ⚡ **Real Token-by-Token Streaming:** Async-iterable event bus delivering text deltas and tool lifecycle events in real time.
- 📊 **Execution Telemetry:** Built-in tracing for timing, token consumption, and span breakdowns.

---

## Installation

```bash
npm install archadi-agent zod
```

*(Optional: Install `better-sqlite3` if you want SQLite database session storage, or `mem0ai` for hosted long-term memory).*

---

## Quick Start

```typescript
import { Agent, Runner, OpenAIProvider, ProviderRegistry, defineTool, z } from "archadi-agent";

// 1. Register model providers
ProviderRegistry.instance().register(
  new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! })
);

// 2. Define a custom tool with Zod validation
const calculator = defineTool({
  name: "calculator",
  description: "Evaluates a basic math expression",
  schema: z.object({ expression: z.string() }),
  execute({ expression }) {
    return { value: Function(`"use strict"; return (${expression})`)() };
  },
});

// 3. Build your Agent
const agent = Agent.builder()
  .name("MathAgent")
  .instructions("You are a helpful math assistant. Use the calculator tool for arithmetic.")
  .model({ provider: "openai", model: "gpt-4o-mini" })
  .tool(calculator)
  .build();

// 4. Run the Agent loop
async function main() {
  const runner = new Runner();
  const result = await runner.run(agent, "What is 15 * 45 + (100 / 4)?");

  console.log("Response:", result.finalOutput);
  console.log("Trace:", result.trace.toPrettyString());
}

main().catch(console.error);
```

---

## Multi-Agent Delegation (Handoffs)

```typescript
import { Agent, defineHandoff } from "archadi-agent";

const coderAgent = Agent.builder()
  .name("CoderAgent")
  .instructions("You handle coding and file execution tasks.")
  .model({ provider: "openai", model: "gpt-4o-mini" })
  .build();

const routerAgent = Agent.builder()
  .name("RouterAgent")
  .instructions("Triage requests. Hand off coding tasks to CoderAgent.")
  .model({ provider: "openai", model: "gpt-4o-mini" })
  .handoff(defineHandoff({ agent: coderAgent, description: "Use for programming tasks." }))
  .build();
```

---

## Documentation

Full documentation, code examples, and API reference available at:
👉 **[ai-agent-sdk.archadi.dev](https://ai-agent-sdk.archadi.dev)**

---

## License

[MIT](./LICENSE) © Aditya Kumar Kushwaha
