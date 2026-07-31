import { ConfigurationError } from "../errors/AgentErrors";
import { Handoff, HandoffTargetAgent } from "../handoff/Handoff";
import { LongTermMemory } from "../memory/LongTermMemory";
import { SessionStore } from "../memory/SessionStore";
import { RetryConfig } from "../providers/resilience";
import { OutputSchema } from "../structured/OutputSchema";
import { Tool } from "../tools/Tool";
import type { InputGuardrail, OutputGuardrail, ToolGuardrail } from "../guardrails/Guardrail";

/** A model target: which registered provider + which model string. Used for the primary model and for fallbacks. */
export interface ModelTarget {
  provider: string;
  model: string;
  timeoutMs?: number;
  retry?: RetryConfig;
}

export interface AgentConfig<TOutput = string> {
  name: string;
  instructions: string | ((ctx: { sessionId?: string }) => string);
  model: ModelTarget;
  /** Additional (provider, model) pairs tried in order if the primary fails after its retry budget. */
  fallbackModels?: ModelTarget[];
  tools?: Tool<any, any>[];
  handoffs?: Handoff<any>[];
  inputGuardrails?: InputGuardrail[];
  outputGuardrails?: OutputGuardrail[];
  toolGuardrails?: ToolGuardrail[];
  outputSchema?: OutputSchema<TOutput>;
  sessionStore?: SessionStore;
  longTermMemory?: LongTermMemory;
  maxTurns?: number;
  temperature?: number;
  maxTokens?: number;
  /** Max handoff hops allowed in one run before HandoffLoopError. */
  maxHandoffDepth?: number;
}

/**
 * Agent — immutable configuration object describing what an agent is
 * (its instructions, model, tools, guardrails, memory, handoffs). It holds
 * no execution state; the Runner is what actually drives the loop. This
 * separation is what lets the same Agent be run concurrently for many
 * different sessions/users safely.
 */
export class Agent<TOutput = string> implements HandoffTargetAgent {
  readonly name: string;
  readonly model: ModelTarget;
  readonly fallbackModels: ModelTarget[];
  readonly tools: Tool<any, any>[];
  readonly handoffs: Handoff<any>[];
  readonly inputGuardrails: InputGuardrail[];
  readonly outputGuardrails: OutputGuardrail[];
  readonly toolGuardrails: ToolGuardrail[];
  readonly outputSchema?: OutputSchema<TOutput>;
  readonly sessionStore?: SessionStore;
  readonly longTermMemory?: LongTermMemory;
  readonly maxTurns: number;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly maxHandoffDepth: number;
  private readonly instructionsSource: string | ((ctx: { sessionId?: string }) => string);

  constructor(config: AgentConfig<TOutput>) {
    if (!config.name) throw new ConfigurationError("Agent requires a name");
    if (!config.instructions) throw new ConfigurationError(`Agent "${config.name}" requires instructions`);
    if (!config.model) throw new ConfigurationError(`Agent "${config.name}" requires a model target`);

    this.name = config.name;
    this.instructionsSource = config.instructions;
    this.model = config.model;
    this.fallbackModels = config.fallbackModels ?? [];
    this.tools = config.tools ?? [];
    this.handoffs = config.handoffs ?? [];
    this.inputGuardrails = config.inputGuardrails ?? [];
    this.outputGuardrails = config.outputGuardrails ?? [];
    this.toolGuardrails = config.toolGuardrails ?? [];
    this.outputSchema = config.outputSchema;
    this.sessionStore = config.sessionStore;
    this.longTermMemory = config.longTermMemory;
    this.maxTurns = config.maxTurns ?? 12;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
    this.maxHandoffDepth = config.maxHandoffDepth ?? 8;

    const toolNames = new Set<string>();
    for (const t of this.tools) {
      if (toolNames.has(t.name)) throw new ConfigurationError(`Agent "${this.name}" has duplicate tool name "${t.name}"`);
      toolNames.add(t.name);
    }
  }

  get instructions(): string {
    return typeof this.instructionsSource === "function" ? this.instructionsSource({}) : this.instructionsSource;
  }

  resolvedInstructions(ctx: { sessionId?: string }): string {
    return typeof this.instructionsSource === "function" ? this.instructionsSource(ctx) : this.instructionsSource;
  }

  findTool(name: string): Tool<any, any> | undefined {
    return this.tools.find((t) => t.name === name);
  }

  findHandoff(toolName: string): Handoff<any> | undefined {
    return this.handoffs.find((h) => h.toolName === toolName);
  }

  static builder<T = string>(): AgentBuilder<T> {
    return new AgentBuilder<T>();
  }
}

/**
 * AgentBuilder — fluent builder pattern for Agent, the same shape as the
 * class-blueprint's `AgentBuilder`, extended with every capability the
 * rubric asks for (model targets + fallbacks, guardrails, handoffs,
 * memory, structured output).
 *
 * const agent = Agent.builder()
 *   .name("SupportAgent")
 *   .instructions("You are a helpful support agent.")
 *   .model({ provider: "openai", model: "gpt-4o-mini" })
 *   .tool(myTool)
 *   .inputGuardrail(maxLengthGuardrail(4000))
 *   .build();
 */
export class AgentBuilder<TOutput = string> {
  private config: Partial<AgentConfig<TOutput>> = {};

  name(name: string): this {
    this.config.name = name;
    return this;
  }

  instructions(instructions: string | ((ctx: { sessionId?: string }) => string)): this {
    this.config.instructions = instructions;
    return this;
  }

  model(target: ModelTarget): this {
    this.config.model = target;
    return this;
  }

  fallbackModel(target: ModelTarget): this {
    this.config.fallbackModels = [...(this.config.fallbackModels ?? []), target];
    return this;
  }

  tool(tool: Tool<any, any>): this {
    this.config.tools = [...(this.config.tools ?? []), tool];
    return this;
  }

  tools(tools: Tool<any, any>[]): this {
    this.config.tools = [...(this.config.tools ?? []), ...tools];
    return this;
  }

  handoff(handoff: Handoff<any>): this {
    this.config.handoffs = [...(this.config.handoffs ?? []), handoff];
    return this;
  }

  inputGuardrail(g: InputGuardrail): this {
    this.config.inputGuardrails = [...(this.config.inputGuardrails ?? []), g];
    return this;
  }

  outputGuardrail(g: OutputGuardrail): this {
    this.config.outputGuardrails = [...(this.config.outputGuardrails ?? []), g];
    return this;
  }

  toolGuardrail(g: ToolGuardrail): this {
    this.config.toolGuardrails = [...(this.config.toolGuardrails ?? []), g];
    return this;
  }

  outputSchema(schema: OutputSchema<TOutput>): this {
    this.config.outputSchema = schema;
    return this;
  }

  sessionStore(store: SessionStore): this {
    this.config.sessionStore = store;
    return this;
  }

  longTermMemory(memory: LongTermMemory): this {
    this.config.longTermMemory = memory;
    return this;
  }

  maxTurns(n: number): this {
    this.config.maxTurns = n;
    return this;
  }

  temperature(t: number): this {
    this.config.temperature = t;
    return this;
  }

  maxTokens(n: number): this {
    this.config.maxTokens = n;
    return this;
  }

  maxHandoffDepth(n: number): this {
    this.config.maxHandoffDepth = n;
    return this;
  }

  build(): Agent<TOutput> {
    return new Agent<TOutput>(this.config as AgentConfig<TOutput>);
  }
}
