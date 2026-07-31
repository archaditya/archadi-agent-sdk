Here is the complete project walkthrough, file-by-file flow explanation, local and hosting setup guide, and the answer to your API key question.

---

### 1. Do We Need All API Keys?
**NO.** You only need **one** valid API key to run and test everything!
- If you have `OPENAI_API_KEY`, setting it in `.env` is enough.
- If you have `GEMINI_API_KEY`, you can set that too.
- The SDK’s `ProviderRegistry` and CLI `registerProvidersFromEnv()` automatically inspect your `.env`. Whichever key exists is registered. If you provide both `OPENAI_API_KEY` and `GEMINI_API_KEY`, OpenAI will act as your primary provider and Gemini will act as an automatic fallback target!

---

### 2. Local Setup & Execution Guide

#### Step 1: Install Dependencies
Open your shell in the repo root (`b:\Personal-Projects\GenAI\Agent-SDK`) and run:
```powershell
npm install
```
*(This installs dependencies across both workspaces: `packages/core` and `packages/cli`).*

#### Step 2: Configure `.env`
Create a `.env` file in the repository root (or copy `.env.example` to `.env`):
```env
OPENAI_API_KEY=your_actual_openai_key_here
OPENAI_MODEL=gpt-4o-mini

GEMINI_API_KEY=your_actual_gemini_key_here
GEMINI_MODEL=gemini-2.0-flash
```

#### Step 3: Build the Monorepo
Compile TypeScript for both core SDK and CLI:
```powershell
npm run build
```

#### Step 4: Run the Interactive CLI REPL
Start chatting with your agent system locally:
```powershell
npm run chat
```

#### Step 5: Test Execution Features & Tracing
```powershell
# Run with live trace output after every response:
npx tsx packages/cli/src/cli.ts chat --trace

# Run with long-term memory enabled:
npx tsx packages/cli/src/cli.ts chat --memory

# Run a single non-interactive command:
npx tsx packages/cli/src/cli.ts chat --once "Calculate 15 * 45 and write the result to math.txt"

# Run any standalone example:
npx tsx examples/01-basic-agent.ts
npx tsx examples/02-multi-agent-handoff.ts
npx tsx examples/03-structured-output.ts
npx tsx examples/04-streaming-guardrails-tracing.ts
npx tsx examples/05-memory-and-sessions.ts
```

---

### 3. Hosted Setup Guide (Documentation Site)

To fulfill the **Documentation Hosting (10 Marks)** requirement, deploy your `/docs` using **VitePress** or **GitHub Pages**.

#### Quick GitHub Pages Setup via VitePress:
1. Initialize VitePress documentation in your repo:
   ```powershell
   npx vitepress init docs
   ```
2. Build static documentation files:
   ```powershell
   npx vitepress build docs
   ```
3. Push to GitHub and enable **GitHub Pages** (or connect your GitHub repo to **Vercel** / **Netlify** for 1-click automatic deployment).

---

### 4. File-by-File Architecture & Execution Flow Explanation

Here is the exact architecture flow of how **ArchadiAgent** works from user prompt to final output:

```
[ User Input ] 
       │
       ▼
 1. Input Guardrails (maxLengthGuardrail, blocklistGuardrail, contentModerationGuardrail)
       │
       ▼
 2. Long-Term Memory Recall (Mem0Memory / SimpleLongTermMemory)
       │
       ▼
 3. Session Transcript Loading (FileSessionStore / SqliteSessionStore / InMemorySessionStore)
       │
       ▼
 4. Provider & Fallback Resolution (generateWithFallback / streamWithFallback)
       │ ──► Sends neutral ModelRequest to OpenAIProvider / ClaudeProvider / GeminiProvider
       │
       ▼
 5. Model Response & Tool Call Detection
       ├── No Tool Call ──► 6. Output Guardrails ──► 7. Structured Output Parsing ──► [ Final Output ]
       └── Tool Call    ──► 8. Tool Guardrail & Human Approval ──► Execute Tool ──► Append Result to Messages ──► (Loop back to 4)
                                    │
                                    └── Handoff Tool? (e.g. transfer_to_CoderAgent) ──► Swap Active Agent & System Prompt ──► (Loop back to 4)
```

---

#### Detailed File Inventory & Responsibilities

##### 📦 Core SDK (`packages/core/src/`)

1. **`index.ts`**
   - **Role:** Barrel export file.
   - **Responsibility:** Re-exports the entire public API (`Agent`, `Runner`, `defineTool`, `defineHandoff`, `SqliteSessionStore`, etc.) so developers can import everything from `"archadi-agent"`.

2. **`agent/Agent.ts`**
   - **Role:** Core Agent entity definition.
   - **Responsibility:** Implements `Agent<TOutput>` class and `AgentBuilder<TOutput>` fluent builder. Holds immutable agent state: name, instructions, primary model, fallback models, tools, handoffs, input/output/tool guardrails, session store, and long-term memory.

3. **`runtime/Runner.ts`**
   - **Role:** The core Agent Loop executor (450+ lines of hand-written logic).
   - **Responsibility:**
     - Orchestrates the full lifecycle: runs input guardrails, recalls memory, loads history, calls model with fallback budget.
     - Handles tool call execution, approval triggers, handoffs, and loop termination (`maxTurns` check).
     - Supports real token-by-token streaming (`runStream`) and structured output repair retries (`resolveStructuredOutput`).

4. **`providers/ModelProvider.ts`**
   - **Role:** Neutral provider interface contract.
   - **Responsibility:** Defines standard types (`ChatMessage`, `ToolSpec`, `ModelRequest`, `ModelResponse`, `ModelStreamEvent`) so the Runner never depends directly on vendor SDKs.

5. **`providers/OpenAIProvider.ts`**, **`ClaudeProvider.ts`**, **`GeminiProvider.ts`**
   - **Role:** Concrete vendor adapters.
   - **Responsibility:** Translates `ModelRequest` into OpenAI Chat Completions REST body, Claude Messages API body, or Gemini `generateContent` JSON format. Implements SSE streaming readers and forwards `AbortSignal`.

6. **`providers/ProviderRegistry.ts`**
   - **Role:** Process-wide Singleton registry.
   - **Responsibility:** Maps provider names (`"openai"`, `"claude"`, `"gemini"`) to `ModelProvider` instances.

7. **`providers/resilience.ts`**
   - **Role:** Reliability & Resilience pipeline.
   - **Responsibility:** Implements `withRetry` (exponential backoff + jitter), `withTimeout`, `generateWithFallback`, and `streamWithFallback` to handle provider failover seamlessly.

8. **`tools/Tool.ts`**
   - **Role:** Custom tool definition and execution wrapper.
   - **Responsibility:** Implements `defineTool()` and `ToolBuilder`. Translates Zod schemas into JSON Schema for function calling, validates inputs, and isolates execution errors.

9. **`handoff/Handoff.ts`**
   - **Role:** Multi-agent delegation system.
   - **Responsibility:** Encapsulates handoffs into tool declarations (`transfer_to_<agent>`). Implements `HandoffGuard` to detect circular loops (A → B → A) or max depth limits.

10. **`guardrails/Guardrail.ts`**
    - **Role:** Safety and policy enforcement.
    - **Responsibility:** Interface for `InputGuardrail`, `OutputGuardrail`, and `ToolGuardrail`. Shipped with 5 ready-made guardrails: `maxLengthGuardrail`, `blocklistGuardrail`, `piiRedactionGuardrail`, `dangerousToolGuardrail`, and `contentModerationGuardrail` (LLM-powered).

11. **`memory/SessionStore.ts`** & **`SqliteSessionStore.ts`**
    - **Role:** Multi-turn transcript storage.
    - **Responsibility:** Maintains transcript history per `sessionId`. Shipped with `InMemorySessionStore`, `FileSessionStore`, and `SqliteSessionStore` (WAL mode + SQLite transactions).

12. **`memory/LongTermMemory.ts`**
    - **Role:** Semantic cross-session recall.
    - **Responsibility:** Implements `Mem0Memory` (mem0.ai client adapter) and `SimpleLongTermMemory` (in-memory keyword scorer).

13. **`structured/OutputSchema.ts`** & **`zodToJsonSchema.ts`**
    - **Role:** Structured output parser and Zod schema converter.
    - **Responsibility:** Converts Zod schemas to JSON schema hints and handles auto-repair prompts when LLMs return invalid JSON.

14. **`tracing/Tracer.ts`** & **`events/AgentEvents.ts`**
    - **Role:** Observability, metrics, and streaming event bus.
    - **Responsibility:** Records execution spans with millisecond timing and token counts; emits typed lifecycle events (`text_delta`, `tool_started`, `handoff_started`, etc.).

---

##### 🖥️ CLI Client (`packages/cli/src/`)

- **`cli.ts`:** CLI entry point, flag parsing (`--trace`, `--session`, `--memory`), environment variable checks.
- **`agents.ts`:** Configures demo agents (`RouterAgent`, `CoderAgent`, `WeatherAgent`) with guardrails, tools, and handoffs.
- **`repl.ts`:** Interactive terminal REPL with live streaming response rendering.
- **`tools/`:**
  - `weatherTool.ts`: Real-time weather lookup tool via `wttr.in`.
  - `fileTools.ts`: Sandboxed file system operations (`write_file`, `read_file`, `list_files`, `calculator`).
  - `execTool.ts`: Approval-gated shell command tool (`run_shell_command`).

---