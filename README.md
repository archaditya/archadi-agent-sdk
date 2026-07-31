# ArchadiAgent

**A from-scratch, provider-agnostic TypeScript SDK for building tool-using, multi-agent LLM systems — plus a CLI you can run today by forking this repo.**

Built by Aditya Kumar Kushwaha for the GenAI with JS 2026 cohort ("Build Your Own Agent SDK").

```bash
git clone <this-repo-url> && cd archadi-agent-sdk
npm install && npm run build
cp .env.example .env    # add an OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY
npm run chat
```

```
you › what's the weather in Goa, and also write me a hello world in c++ and run it
  ↪ handoff: RouterAgent → WeatherAgent
  ⚙ calling get_weather({"city":"Goa"})
  ✓ get_weather done (540ms)
WeatherAgent › It's sunny in Goa, ~31°C right now...

  ↪ handoff: RouterAgent → CoderAgent
  ⚙ calling write_file({"path":"hello.cpp",...})
  ✓ write_file done (2ms)
  ⚠ "run_shell_command" wants to run g++ hello.cpp -o hello && ./hello. Approve? [y/N] y
  ✓ run_shell_command done (612ms)
CoderAgent › Wrote hello.cpp and ran it — output: "Hello, World!"
```

---

## What this is

This started from a class blueprint: a builder-pattern `Agent`, a raw `ITool` interface, and a hand-rolled JSON "step pipeline" loop calling OpenAI directly. ArchadiAgent keeps the spirit (builder pattern, tool interface, an agent loop you can actually read) and rebuilds the runtime as a real SDK:

- **Native function-calling**, not a fragile hand-parsed JSON step protocol
- **Provider-agnostic** — OpenAI, Claude, and Gemini adapters behind one interface, with automatic retries, timeouts, and model fallback chains
- **Multi-agent handoffs** with loop detection, not just disconnected agent instances
- **Guardrails** (input/output/tool), with human-approval gating for dangerous tools
- **Memory** — both raw session transcripts and semantic long-term memory via [mem0](https://mem0.ai)
- **Structured output** with automatic JSON-repair retries
- **Streaming events** and **full execution tracing**, out of the box
- **A CLI you can run immediately**, before ever touching auth, billing, or a web dashboard

See the [full documentation](./docs/README.md) for every capability with runnable code.

## Architecture

```
archadi-agent-sdk/
├── packages/
│   ├── core/         → the SDK itself, published as "archadi-agent"
│   │   └── src/
│   │       ├── agent/        Agent, AgentBuilder
│   │       ├── runtime/      Runner (the agent loop)
│   │       ├── tools/        Tool, ToolBuilder, defineTool
│   │       ├── providers/    ModelProvider + OpenAI/Claude/Gemini adapters, ProviderRegistry, retry/fallback
│   │       ├── memory/       SessionStore (in-memory/file), LongTermMemory (mem0 + fallback)
│   │       ├── guardrails/   Input/Output/Tool guardrails
│   │       ├── handoff/      Handoff, HandoffGuard (loop prevention)
│   │       ├── structured/   OutputSchema (Zod-backed structured output)
│   │       ├── tracing/      Tracer (singleton), Trace, spans
│   │       └── events/       Typed AgentEventBus for streaming
│   └── cli/           → "archadi" — the interactive terminal client
├── examples/           → 4 standalone runnable scripts
└── docs/               → installation → quickstart → every capability, with code
```

**Design patterns used deliberately, not decoratively:**
- **Builder** — `AgentBuilder`, `ToolBuilder` for fluent, readable construction
- **Singleton** — `ProviderRegistry` and `Tracer`, so a host app registers providers/collects traces once, process-wide, without threading them through every function call
- **Strategy** — `ModelProvider` interface swaps OpenAI/Claude/Gemini/anything-you-write behind one call signature
- **Observer** — `AgentEventBus` for streaming lifecycle events to any listener (CLI, future dashboard, logging)

## Who it's for

Developers who want to ship an agent — with tools, memory, and guardrails — without adopting a heavyweight framework or being locked to one model vendor. If you've outgrown "just call the chat completions API in a loop" but don't want the surface area of a full agent platform, this is the middle layer.

## Why it should exist

Most hosted agent frameworks couple you to one vendor's models, ship as a black box you can't fully read, or require a server and a database before you can run your first agent. ArchadiAgent is small enough to read end-to-end in an afternoon, has zero required infrastructure (an in-memory or file-based session store works out of the box), and treats "which LLM" as a swappable detail rather than a foundational decision.

## How it differs from existing SDKs

Compared to the OpenAI Agents SDK (the closest inspiration, see [openai.github.io/openai-agents-python](https://openai.github.io/openai-agents-python/)): ArchadiAgent is provider-agnostic from day one rather than OpenAI-first, ships a working CLI as the primary onboarding path instead of only a Python/TS library, and bakes semantic long-term memory (via mem0) into the same `Agent` config as session history — most SDKs make you wire that up yourself.

## Roadmap

The next phase (in progress) adds a full-stack layer on top of this SDK: user accounts, API-key issuance and auth, and a hosted playground/dashboard for running these same agents over HTTP — so the same `Agent`/`Runner` code that powers the CLI powers a real product.

## License

MIT — see [LICENSE](./LICENSE).
