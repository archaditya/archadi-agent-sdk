### 🧪 Test 1: Interactive REPL Chat (`npm run chat`)

Command:
```powershell
npm run chat
```

### Testing Checklist:

1. **Weather Lookup (WeatherAgent Handoff):**
   - Type: `What is the weather in Delhi?`
   - *Expected:* RouterAgent weather request dekhega aur `WeatherAgent` ko handoff karega, wttr.in tool call karke realtime report layega.

2. **Calculator Tool:**
   - Type: `What is 15 * 45 + (100 / 4)?`
   - *Expected:* Directly calculator tool execute karke answer dega.

3. **CoderAgent Handoff & Approval Gate:**
   - Type: `Write a hello world program in c++ to hello.cpp and run it`
   - *Expected:* 
     - RouterAgent -> CoderAgent handoff hoga.
     - `write_file` tool chala ke `./workspace/hello.cpp` create karega.
     - Shell command chalane se pehle **`[y/N]` human approval prompt** puchega (`requiresApproval: true`).
     - Aap `y` press karoge toh compile karke output dikhayega!

4. **Toggle Tracing in Chat:**
   - Type: `/trace`
   - Phir koi question pucho: `What is the capital of France?`
   - *Expected:* Output ke sath poora **Execution Trace** (timing + tokens used + span breakdown) print hoga.

5. **Exit REPL:**
   - Type: `/exit`

---

### 🧪 Test 2: Multi-Agent Handoff Example (`02-multi-agent-handoff.ts`)

Chat test ho jaye toh terminal mein chalao:
```powershell
npx tsx examples/02-multi-agent-handoff.ts
```
*Expected:* Router customer support request analyze karke `RefundAgent` ko handover karega aur exact empathetic refund response print hoga.

---

### 🧪 Test 3: Structured Output Test (`03-structured-output.ts`)

Run command:
```powershell
npx tsx examples/03-structured-output.ts
```
*Expected:* Model answer text ki jagah proper Zod Schema JSON format (title, servings, ingredients, steps) mein dega.

---

### 🧪 Test 4: Streaming, Guardrails & Tracing (`04-streaming-guardrails-tracing.ts`)

Run command:
```powershell
npx tsx examples/04-streaming-guardrails-tracing.ts
```
*Expected:* Response real-time token-by-token stream hoga screen par aur end mein complete Execution Trace print hoga.

---

### 🧪 Test 5: Memory & Sessions Test (`05-memory-and-sessions.ts`)

Run command:
```powershell
npx tsx examples/05-memory-and-sessions.ts
```
*Expected:*
- Turn 1 & 2: Same session ID mein memory remember karega.
- Turn 3: New session ID (different conversation) par bhi Long-Term Memory recall karke pehchanega!
- Turn 4: Different user par ignore karega.

---