# ArchadiAgent SDK — Project Context & Status Report

> **SDK Name:** ArchadiAgent  
> **Author:** Aditya Kumar Kushwaha  
> **Cohort:** GenAI with JS 2026  
> **Assignment:** "Build Your Own Agent SDK"  
> **Repo:** [b:\Personal-Projects\GenAI\Agent-SDK](file:///b:/Personal-Projects/GenAI/Agent-SDK)

---

## 1. Architecture Overview

```
archadi-agent-sdk/          (npm workspace monorepo)
├── packages/
│   ├── core/               → the SDK library ("archadi-agent")
│   │   └── src/
│   │       ├── agent/          Agent.ts (Agent class + AgentBuilder)
│   │       ├── runtime/        Runner.ts (the agent loop — 454 LOC, core of SDK)
│   │       ├── tools/          Tool.ts (Tool class + ToolBuilder + defineTool)
│   │       ├── providers/      ModelProvider interface + OpenAI/Claude/Gemini adapters
│   │       │                   ProviderRegistry (singleton) + resilience (retry/timeout/fallback)
│   │       ├── memory/         SessionStore (InMemory + File) + LongTermMemory (Mem0 + Simple)
│   │       ├── guardrails/     InputGuardrail/OutputGuardrail/ToolGuardrail interfaces + 4 ready-made
│   │       ├── handoff/        Handoff class + HandoffGuard (loop prevention)
│   │       ├── structured/     OutputSchema (Zod-backed) + zodToJsonSchema converter
│   │       ├── tracing/        Tracer (singleton) + Trace (spans with timing/tokens)
│   │       ├── events/         AgentEventBus (typed EventEmitter) + async iterable adapter
│   │       ├── errors/         Full error hierarchy (10 error classes under AgentSDKError)
│   │       ├── types/          mem0ai.d.ts ambient types
│   │       └── index.ts        barrel export (all public API)
│   └── cli/                → "archadi" CLI client
│       └── src/
│           ├── cli.ts          entry point, arg parsing, orchestration
│           ├── agents.ts       demo multi-agent setup (RouterAgent → CoderAgent / WeatherAgent)
│           ├── providers.ts    auto-register from env
│           ├── repl.ts         interactive REPL with streaming events display
│           ├── ui.ts           chalk-based terminal output helpers
│           └── tools/          weatherTool, fileTools (write/read/list/calc), execTool
├── examples/               → 4 standalone runnable examples
├── docs/                   → 12 markdown documentation files (installation → CLI reference)
├── package.json            → workspace root
├── README.md               → pitch-quality README (~93 lines)
├── .env.example            → template for API keys
├── LICENSE                 → MIT
└── .gitignore
```

**Design Patterns Used:**
- **Builder** — `AgentBuilder`, `ToolBuilder`
- **Singleton** — `ProviderRegistry`, `Tracer`
- **Strategy** — `ModelProvider` interface (swap OpenAI/Claude/Gemini)
- **Observer** — `AgentEventBus` for streaming lifecycle events

---

## 2. Current Build Status

| Item | Status |
|------|--------|
| `node_modules` installed | ❌ **NOT installed** |
| Core SDK compiled (`packages/core/dist`) | ❌ **NOT built** |
| CLI compiled (`packages/cli/dist`) | ❌ **NOT built** |
| Git initialized | ❌ **NOT initialized** |
| Published to npm | ❌ **NOT published** |
| Tests written | ❌ **NONE exist** |
| Hosted documentation | ❌ **NOT hosted** |
| GitHub repo (public) | ❌ **NOT created** |
| Demo video | ❌ **NOT recorded** |
| Social media post | ❌ **NOT posted** |

---

## 3. Rubric-by-Rubric Assessment

### ✅ 1. Agent Runtime (15 Marks) — **CODE DONE, NEEDS TESTING**

| Requirement | Status | Where |
|-------------|--------|-------|
| Original agent loop | ✅ Written | [Runner.ts](file:///b:/Personal-Projects/GenAI/Agent-SDK/packages/core/src/runtime/Runner.ts) — 454-line hand-written loop |
| Multi-turn execution | ✅ SessionStore integration | Runner loads prior history from store |
| Tool-call handling | ✅ Full flow | `executeToolCall()` with validation, guardrails, approval |
| Safe stopping (maxTurns) | ✅ `MaxTurnsExceededError` | Runner line ~293-295 |
| Clear final result | ✅ `RunResult<TOutput>` type | Typed return with runId, trace, history, timing |
| AbortSignal support | ✅ Passed to tool context | `signal` in RunOptions |

**Gaps:** No unit tests to prove it works. Streaming variant (`runStream`) dispatches events but the Runner itself always uses `generate()` not `stream()` from the provider — so text deltas are faked (the full response text is emitted as a single delta, not token-by-token).

---

### ✅ 2. Tools (10 Marks) — **CODE DONE**

| Requirement | Status | Where |
|-------------|--------|-------|
| Custom tool creation | ✅ `defineTool()` + `ToolBuilder` | [Tool.ts](file:///b:/Personal-Projects/GenAI/Agent-SDK/packages/core/src/tools/Tool.ts) |
| Input validation | ✅ Zod `safeParse` | Tool.run() validates before executing |
| Async execution | ✅ `execute()` can be sync or async | Promise-based |
| Typed results | ✅ `ToolResult<TOutput>` | Generic typed |
| Error handling | ✅ `ToolExecutionError`, `ToolValidationError` | Errors caught and normalized |
| `requiresApproval` flag | ✅ | Tool-level and guardrail-level approval |

**Gaps:** None significant. 5 real demo tools exist in CLI (weather, write_file, read_file, list_files, run_shell_command, calculator).

---

### ✅ 3. Handoffs (10 Marks) — **CODE DONE**

| Requirement | Status | Where |
|-------------|--------|-------|
| Working multi-agent delegation | ✅ | [Handoff.ts](file:///b:/Personal-Projects/GenAI/Agent-SDK/packages/core/src/handoff/Handoff.ts) — surfaced as `transfer_to_<name>` tool |
| Correct context transfer | ✅ | System prompt swapped, optional `inputFilter` |
| Handoff-loop prevention | ✅ `HandoffGuard` | Max depth + immediate cycle detection (A→B→A) |
| Clear documentation | ✅ | [04-handoffs.md](file:///b:/Personal-Projects/GenAI/Agent-SDK/docs/04-handoffs.md) |
| Appears in traces | ✅ | Handoff spans recorded in Trace |
| Events emitted | ✅ | `handoff_started`, `handoff_completed` |

**Gaps:** `defineHandoff` convenience works but the `inputFilter` path in Runner has a subtle issue — it appends a bridge `user` message but doesn't strip the old user message, which could confuse the target agent. Minor.

---

### ✅ 4. Guardrails (10 Marks) — **CODE DONE**

| Requirement | Status | Where |
|-------------|--------|-------|
| Input validation | ✅ `InputGuardrail` | [Guardrail.ts](file:///b:/Personal-Projects/GenAI/Agent-SDK/packages/core/src/guardrails/Guardrail.ts) |
| Output validation | ✅ `OutputGuardrail` | Runs after final answer, can modify output |
| Tool safety | ✅ `ToolGuardrail` | Runs before each tool call |
| Controlled failures | ✅ `GuardrailError` | Thrown with stage + reason |
| Approval support | ✅ `ApprovalHandler` | Async callback, wired into CLI as Y/N prompt |
| Ready-made guardrails | ✅ 4 shipped | `maxLengthGuardrail`, `blocklistGuardrail`, `piiRedactionGuardrail`, `dangerousToolGuardrail` |

**Gaps:** No LLM-based guardrail (e.g. "ask the model to judge if the output is safe"). Only rule-based ones exist. Not required, but would be impressive.

---

### ✅ 5. Memory & Sessions (10 Marks) — **CODE DONE**

| Requirement | Status | Where |
|-------------|--------|-------|
| Multi-turn state | ✅ `SessionStore` interface | [SessionStore.ts](file:///b:/Personal-Projects/GenAI/Agent-SDK/packages/core/src/memory/SessionStore.ts) |
| `InMemorySessionStore` | ✅ | Fast, per-process |
| `FileSessionStore` | ✅ | JSON file per process, survives restarts |
| Persistent session support | ✅ | File store + Mem0 long-term |
| Long-term memory | ✅ `LongTermMemory` interface | [LongTermMemory.ts](file:///b:/Personal-Projects/GenAI/Agent-SDK/packages/core/src/memory/LongTermMemory.ts) |
| Mem0 integration | ✅ `Mem0Memory` | Hosted + local mode, dynamic import |
| Simple fallback | ✅ `SimpleLongTermMemory` | Keyword-scored in-memory recall |
| Clean storage abstraction | ✅ | Interface-based, Runner only talks to interface |

**Gaps:** No SQLite/Redis adapter (rubric mentions them as options — having File + InMemory + Mem0 is solid, but a SQLite adapter would be extra credit). The `listSessions()` on FileSessionStore works but there's no "delete session" beyond `clear()`.

---

### ✅ 6. Structured Output & Streaming (10 Marks) — **CODE DONE**

| Requirement | Status | Where |
|-------------|--------|-------|
| Schema validation | ✅ Zod-based | [OutputSchema.ts](file:///b:/Personal-Projects/GenAI/Agent-SDK/packages/core/src/structured/OutputSchema.ts) |
| Typed output | ✅ Generic `Agent<TOutput>` → `RunResult<TOutput>` | Fully typed end-to-end |
| Invalid-output handling | ✅ Auto-repair retry (2 attempts) | `resolveStructuredOutput()` in Runner |
| JSON fence stripping | ✅ | `extractJsonBlock()` handles ```json fences |
| Zod→JSON Schema | ✅ Custom converter | [zodToJsonSchema.ts](file:///b:/Personal-Projects/GenAI/Agent-SDK/packages/core/src/structured/zodToJsonSchema.ts) |
| Streaming events | ✅ `runStream()` returns async iterable | [AgentEvents.ts](file:///b:/Personal-Projects/GenAI/Agent-SDK/packages/core/src/events/AgentEvents.ts) |
| Event types | ✅ 11 event types defined | `run_started`, `text_delta`, `tool_*`, `handoff_*`, `guardrail_triggered`, `retry`, `run_completed`, `run_failed` |

**Gaps:** Runner calls `generate()` (non-streaming) even when `runStream()` is used — it just emits the full response text as a single `text_delta`. True token-by-token streaming would require calling `provider.stream()` instead. This is a **notable shortcoming** for the streaming marks. The Provider `stream()` methods ARE implemented (OpenAI, Claude, Gemini all have `async *stream()`) but the Runner doesn't call them.

---

### ✅ 7. Reliability (10 Marks) — **CODE DONE**

| Requirement | Status | Where |
|-------------|--------|-------|
| Retries | ✅ Exponential backoff with jitter | [resilience.ts](file:///b:/Personal-Projects/GenAI/Agent-SDK/packages/core/src/providers/resilience.ts) |
| Timeouts | ✅ `withTimeout()` | Per-provider configurable |
| Model fallback | ✅ `generateWithFallback()` | Ordered chain, each with own retry budget |
| Clear errors | ✅ 10-class error hierarchy | [AgentErrors.ts](file:///b:/Personal-Projects/GenAI/Agent-SDK/packages/core/src/errors/AgentErrors.ts) |
| Loop prevention | ✅ `maxTurns`, `HandoffGuard` | Both turn-count and handoff-depth limits |
| Safe secret handling | ⚠️ Partial | API keys stored as private fields, not in logs/traces, but no explicit scrubbing |

**Gaps:** `AbortSignal` is threaded into `ToolContext` but not used in the `fetch()` calls to providers. Also, `withTimeout` uses `setTimeout` race rather than `AbortSignal`, which means the underlying HTTP request isn't actually cancelled — it just orphans. Minor but notable.

---

### ✅ 8. Tracing (5 Marks) — **CODE DONE**

| Requirement | Status | Where |
|-------------|--------|-------|
| Tool calls visible | ✅ | Span per tool call with input/output/duration |
| Handoffs visible | ✅ | Span per handoff |
| Timing recorded | ✅ | `startedAt`, `endedAt`, `durationMs` |
| Errors recorded | ✅ | `span.error` field |
| Token usage | ✅ | Aggregated `totalTokenUsage` on trace |
| Pretty print | ✅ | `trace.toPrettyString()` for CLI |
| Listener hooks | ✅ | `tracer.onFinish()` subscription |

**Gaps:** None significant. Tracing is solid.

---

### ⚠️ 9. Developer Experience (10 Marks) — **MOSTLY DONE, NEEDS POLISH**

| Requirement | Status | Where |
|-------------|--------|-------|
| Clean API design | ✅ | Builder pattern, `defineTool`, `defineHandoff` convenience functions |
| TypeScript support | ✅ | Full types, generics on `Agent<TOutput>`, `Tool<TInput,TOutput>` |
| Sensible defaults | ✅ | `maxTurns=12`, `maxHandoffDepth=8`, `temperature=0.7`, `timeout=30s` |
| Clear error messages | ✅ | All errors have human-readable messages with context |
| Easy setup | ⚠️ | Not yet on npm; requires git clone |

**Gaps:**
- ❌ **No tests at all** — no unit tests, no integration tests
- ❌ **No npm publish** — users can't `npm install archadi-agent`
- ⚠️ The project hasn't been built/compiled yet (no `dist/` directory)
- ⚠️ `node_modules` not installed — has never been successfully `npm install`ed in current state

---

### ⚠️ 10. Documentation & Examples (10 Marks) — **WRITTEN, NOT HOSTED**

| Requirement | Status | Where |
|-------------|--------|-------|
| Docs written | ✅ | 12 markdown files in `docs/` |
| Working quick start | ✅ | [02-quickstart.md](file:///b:/Personal-Projects/GenAI/Agent-SDK/docs/02-quickstart.md) |
| At least 2 examples | ✅ | 4 standalone examples |
| Clear API reference | ✅ | Inline in each doc page |
| **Hosted documentation** | ❌ **MISSING** | **Required by rubric** |

**Gaps:**
- ❌ **Docs not hosted anywhere** — rubric explicitly says "Create and host documentation". Need to deploy via GitHub Pages, Vercel, Docusaurus, VitePress, or similar.
- ⚠️ Installation doc has placeholder `<your-username>` in git clone URL

---

### ⚠️ 11. Product Thinking (10 Marks) — **PARTIALLY DONE**

| Requirement | Status | Where |
|-------------|--------|-------|
| Clear target user | ✅ | README explains who it's for |
| Strong differentiation | ✅ | Provider-agnostic, CLI-first, Mem0 baked in |
| Real problem being solved | ✅ | Middle layer between raw API calls and heavy frameworks |
| Believable product direction | ✅ | Roadmap mentions full-stack layer |

**Gaps:** No separate pitch document or landing page. The README does a decent job but a dedicated pitch page would be stronger.

---

### ❌ 12. Demo & Pitch (10 Marks) — **NOT STARTED**

| Requirement | Status |
|-------------|--------|
| Student appears in video | ❌ **NOT recorded** |
| Product demonstrated clearly | ❌ |
| Technical decisions explained | ❌ |
| Pitch is convincing | ❌ |
| Public social media post | ❌ |

---

## 4. Score Estimation (Current State)

| Category | Max | Estimated | Notes |
|----------|-----|-----------|-------|
| 1. Agent Runtime | 15 | 13 | Solid loop, but streaming is simulated not real |
| 2. Tools | 10 | 9 | Excellent coverage, real demo tools |
| 3. Handoffs | 10 | 9 | Working with loop prevention |
| 4. Guardrails | 10 | 8 | All three types + approval, rule-based only |
| 5. Memory & Sessions | 10 | 8 | InMemory + File + Mem0, no SQLite/Redis |
| 6. Structured Output & Streaming | 10 | 7 | Schema + repair good, streaming is faked |
| 7. Reliability | 10 | 8 | Retry/timeout/fallback solid, AbortSignal incomplete |
| 8. Tracing | 5 | 5 | Complete |
| 9. Developer Experience | 10 | 5 | Great API but no tests, no npm, not built |
| 10. Documentation & Examples | 10 | 5 | Written but NOT hosted |
| 11. Product Thinking | 10 | 7 | Good README, no landing page |
| 12. Demo & Pitch | 10 | 0 | Not started |
| **TOTAL** | **120** | **~84** | **~70% if submitted as-is (after build fix)** |

---

## 5. Remaining Work — Prioritized

### 🔴 CRITICAL (Must Do for Submission)

| # | Task | Est. Time | Impact |
|---|------|-----------|--------|
| 1 | `npm install` + `npm run build` — verify everything compiles cleanly | 15 min | Can't submit if it doesn't build |
| 2 | `git init` + push to public GitHub repo | 15 min | Required for submission |
| 3 | **Host documentation** — VitePress/Docusaurus on GitHub Pages or Vercel | 1-2 hrs | 10 marks at stake |
| 4 | **Record demo video** — face visible, show CLI in action, explain decisions | 30-60 min | 10 marks at stake |
| 5 | **Post video on X/LinkedIn/Instagram** publicly | 10 min | Required for submission |
| 6 | Fix installation doc placeholder (`<your-username>` → real username) | 2 min | Credibility |

### 🟡 HIGH PRIORITY (Big Mark Impact)

| # | Task | Est. Time | Impact |
|---|------|-----------|--------|
| 7 | **Real streaming** — make Runner call `provider.stream()` for true token-by-token delivery | 2-3 hrs | +2-3 marks (Streaming section) |
| 8 | **Write tests** — at least unit tests for Tool, Guardrail, HandoffGuard, OutputSchema, zodToJsonSchema | 2-3 hrs | +3-4 marks (DX section) |
| 9 | **npm publish** (`archadi-agent` on npm) | 30 min | +1-2 marks (DX section) |
| 10 | Add a **5th example** — e.g. memory/sessions example, or multi-provider fallback | 30 min | +1 mark |

### 🟢 NICE TO HAVE (Polish & Extra Credit)

| # | Task | Est. Time | Impact |
|---|------|-----------|--------|
| 11 | Add a **SQLite SessionStore** adapter | 1 hr | +1 mark (Memory section) |
| 12 | Wire `AbortSignal` through provider `fetch()` calls | 30 min | +1 mark (Reliability) |
| 13 | Add an LLM-based guardrail (e.g. "ask the model if this is safe") | 1 hr | +1 mark (Guardrails) |
| 14 | Create a simple landing page / pitch page | 1-2 hrs | +1-2 marks (Product Thinking) |
| 15 | Add `CONTRIBUTING.md`, `CHANGELOG.md` | 15 min | Polish |
| 16 | Add CI (GitHub Actions) for typecheck + test on push | 30 min | Polish |

---

## 6. Key Technical Decisions Already Made

1. **Monorepo with npm workspaces** — `packages/core` (library) + `packages/cli` (consumer)
2. **CommonJS output** (not ESM) — `"type": "commonjs"` in both packages, `"module": "CommonJS"` in tsconfig
3. **Zod as the only runtime dependency** of the core SDK — everything else (providers, mem0) is optional/peer
4. **Raw `fetch()` for HTTP** — no axios/node-fetch in core; axios only in CLI's weatherTool
5. **Singleton pattern** for `ProviderRegistry` and `Tracer` — process-wide, register once
6. **Agent is immutable config, Runner is stateless executor** — clean separation
7. **Handoffs are tools** — surfaced to the model as `transfer_to_<name>` function calls

---

## 7. Potential Issues to Watch

1. **The project has never been built.** `npm install` may fail if workspace linking doesn't resolve correctly. Need to verify.
2. **`ReadableStream` in Node.js** — The provider SSE streaming uses `ReadableStream<Uint8Array>` which requires Node 18+. The tsconfig targets ES2021 and `lib: ["ES2021"]` which may not include `ReadableStream` types. May need `@types/node` or adding `"DOM"` to lib.
3. **`chalk` v4 is CJS-compatible** (good), but if upgraded to v5+ it's ESM-only and would break the CommonJS build.
4. **`fallbackModels` is a `readonly` array on Agent, but CLI code does `coder.fallbackModels.push(t)`** — this mutates a readonly array (TypeScript will warn, but since `readonly` is only a type-level constraint, it works at runtime). Should use the builder instead.
5. **No `.env` file exists** — only `.env.example`. CLI will fail without at least one API key.

---

## 8. File Inventory (Source LOC)

| File | Lines | Purpose |
|------|-------|---------|
| `core/src/runtime/Runner.ts` | 454 | The agent loop — biggest file, core logic |
| `core/src/agent/Agent.ts` | 220 | Agent config + AgentBuilder |
| `core/src/providers/OpenAIProvider.ts` | 193 | OpenAI adapter |
| `core/src/providers/ClaudeProvider.ts` | 190 | Claude adapter |
| `core/src/providers/GeminiProvider.ts` | 156 | Gemini adapter |
| `core/src/tracing/Tracer.ts` | 158 | Trace + Tracer singleton |
| `core/src/memory/LongTermMemory.ts` | 134 | Mem0Memory + SimpleLongTermMemory |
| `core/src/tools/Tool.ts` | 133 | Tool + ToolBuilder + defineTool |
| `core/src/errors/AgentErrors.ts` | 110 | 10-class error hierarchy |
| `core/src/events/AgentEvents.ts` | 101 | Event bus + async iterable |
| `core/src/memory/SessionStore.ts` | 100 | InMemory + File session stores |
| `core/src/providers/resilience.ts` | 94 | retry, timeout, fallback |
| `core/src/guardrails/Guardrail.ts` | 95 | Guardrail interfaces + 4 ready-made |
| `core/src/handoff/Handoff.ts` | 84 | Handoff + HandoffGuard |
| `core/src/structured/zodToJsonSchema.ts` | 78 | Zod → JSON Schema converter |
| `core/src/providers/ModelProvider.ts` | 77 | Provider-agnostic interfaces |
| `core/src/index.ts` | 73 | Barrel exports |
| `core/src/providers/ProviderRegistry.ts` | 54 | Provider registry singleton |
| `core/src/structured/OutputSchema.ts` | 45 | Structured output wrapper |
| **Core SDK Total** | **~2,549** | |
| `cli/src/*` + `cli/src/tools/*` | ~423 | CLI application |
| `examples/*` | ~131 | 4 examples |
| `docs/*` | ~780 | 12 documentation files |
| **Grand Total** | **~3,883** | |

---

## 9. Summary

**Where we stand:** The SDK code is **architecturally complete** — every rubric requirement has corresponding implementation code. The core agent loop, tools, handoffs, guardrails, memory, structured output, tracing, events, and multi-provider support are all written.

**What's missing is the surrounding ecosystem:** build verification, tests, npm publish, hosted docs, git repo, demo video, and social media post. The streaming implementation is also technically simulated rather than real token-by-token.

**Priority order for remaining work:**
1. Build & verify → Git & GitHub → Host docs → Record video → Post publicly
2. Then: real streaming, tests, npm publish
3. Then: SQLite adapter, AbortSignal, LLM guardrail, landing page
