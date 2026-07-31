import {
  Agent,
  AgentBuilder,
  LongTermMemory,
  ModelTarget,
  SessionStore,
  blocklistGuardrail,
  defineHandoff,
  maxLengthGuardrail,
  piiRedactionGuardrail,
} from "archadi-agent";
import { weatherTool } from "./tools/weatherTool";
import { calculatorTool, listFilesTool, readFileTool, writeFileTool } from "./tools/fileTools";
import { execTool } from "./tools/execTool";

export interface AgentSet {
  router: Agent<string>;
  coder: Agent<string>;
  weather: Agent<string>;
}

export interface BuildAgentsOptions {
  primary: ModelTarget;
  fallbacks: ModelTarget[];
  sessionStore?: SessionStore;
  longTermMemory?: LongTermMemory;
}

/** Applies fallback models to a builder via the fluent API instead of mutating the readonly array. */
function applyFallbacks<T>(builder: AgentBuilder<T>, fallbacks: ModelTarget[]): AgentBuilder<T> {
  for (const t of fallbacks) {
    builder = builder.fallbackModel(t);
  }
  return builder;
}

/**
 * Builds the CLI's demo multi-agent setup:
 *
 *   RouterAgent  --(handoff)-->  CoderAgent   (shell + file tools, approval-gated)
 *                --(handoff)-->  WeatherAgent (weather lookup tool)
 *
 * This mirrors (and upgrades) the class blueprint's `agent` / `weatherAgent`
 * / `xyzAgent` example, now wired together with real handoffs instead of
 * three disconnected agents.
 */
export function buildAgents(options: BuildAgentsOptions): AgentSet {
  const shared = {
    model: options.primary,
    fallbacks: options.fallbacks,
    sessionStore: options.sessionStore,
    longTermMemory: options.longTermMemory,
    inputGuardrails: [maxLengthGuardrail(8000), blocklistGuardrail(["rm -rf /", "format c:"])],
    outputGuardrails: [piiRedactionGuardrail()],
  };

  const coder = applyFallbacks(
    Agent.builder()
      .name("CoderAgent")
      .instructions(
        [
          "You are an expert coding agent running inside a sandboxed CLI workspace.",
          "You can write files with write_file, read them with read_file, list them with list_files,",
          "and compile/run code with run_shell_command (this requires human approval — expect it to sometimes be denied).",
          "Always write a file before trying to run/compile it. Be concise about what you did.",
        ].join(" ")
      )
      .model(shared.model)
      .tool(writeFileTool)
      .tool(readFileTool)
      .tool(listFilesTool)
      .tool(execTool)
      .tool(calculatorTool)
      .sessionStore(shared.sessionStore as SessionStore)
      .maxTurns(15),
    shared.fallbacks
  ).build();

  const weather = applyFallbacks(
    Agent.builder()
      .name("WeatherAgent")
      .instructions("You are an expert weather agent. Use get_weather to answer questions about current conditions in a city, then summarize it conversationally.")
      .model(shared.model)
      .tool(weatherTool)
      .sessionStore(shared.sessionStore as SessionStore)
      .maxTurns(6),
    shared.fallbacks
  ).build();

  const router = applyFallbacks(
    Agent.builder()
      .name("RouterAgent")
      .instructions(
        [
          "You are ArchadiAgent's general assistant.",
          "You can do simple math yourself or with the calculator tool.",
          "For anything involving writing/compiling/running code or files, hand off to CoderAgent.",
          "For anything about current weather, hand off to WeatherAgent.",
          "Otherwise, just answer directly and concisely.",
        ].join(" ")
      )
      .model(shared.model)
      .tool(calculatorTool)
      .handoff(defineHandoff({ agent: coder, description: "Hand off coding, file, or shell-command tasks to the coding specialist." }))
      .handoff(defineHandoff({ agent: weather, description: "Hand off current-weather questions to the weather specialist." }))
      .sessionStore(shared.sessionStore as SessionStore)
      .longTermMemory(shared.longTermMemory as LongTermMemory)
      .inputGuardrail(shared.inputGuardrails[0])
      .inputGuardrail(shared.inputGuardrails[1])
      .outputGuardrail(shared.outputGuardrails[0])
      .maxTurns(10),
    shared.fallbacks
  ).build();

  return { router, coder, weather };
}
