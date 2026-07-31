/**
 * Minimal structural type for the agent being handed off to. Kept separate
 * from the concrete `Agent` class to avoid a circular import between
 * agent/Agent.ts and handoff/Handoff.ts — any object with a `name` and
 * `instructions` satisfies it.
 */
export interface HandoffTargetAgent {
  name: string;
  instructions: string;
}

export interface HandoffConfig<TAgent extends HandoffTargetAgent = HandoffTargetAgent> {
  /** The agent execution transfers to. */
  agent: TAgent;
  /** Shown to the source agent's model so it knows when to use this handoff. */
  description?: string;
  /**
   * Optionally rewrite what the target agent sees as its opening input —
   * e.g. to strip earlier scratch-work and hand over a clean brief.
   */
  inputFilter?: (input: string, fullHistorySoFar: string) => string;
}

/**
 * A Handoff is surfaced to the model as a regular tool named
 * `transfer_to_<agent_name>`. When the model "calls" it, the Runner swaps
 * the active agent instead of executing normal tool logic.
 */
export class Handoff<TAgent extends HandoffTargetAgent = HandoffTargetAgent> {
  readonly toolName: string;
  readonly description: string;
  readonly agent: TAgent;
  readonly inputFilter?: (input: string, fullHistorySoFar: string) => string;

  constructor(config: HandoffConfig<TAgent>) {
    this.agent = config.agent;
    this.toolName = `transfer_to_${slugify(config.agent.name)}`;
    this.description =
      config.description ?? `Transfer this conversation to the "${config.agent.name}" agent when its expertise is a better fit.`;
    this.inputFilter = config.inputFilter;
  }
}

export function defineHandoff<TAgent extends HandoffTargetAgent>(config: HandoffConfig<TAgent>): Handoff<TAgent> {
  return new Handoff(config);
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Guards against infinite handoff ping-pong (A -> B -> A -> B -> ...).
 * Tracks the chain of agent names visited during a single run.
 */
export class HandoffGuard {
  private chain: string[] = [];

  constructor(private readonly maxDepth: number = 8) {}

  visit(agentName: string): void {
    this.chain.push(agentName);
  }

  get depth(): number {
    return this.chain.length;
  }

  get path(): string[] {
    return [...this.chain];
  }

  exceededMaxDepth(): boolean {
    return this.chain.length > this.maxDepth;
  }

  /** Detects an immediate A->B->A cycle, which is almost always a prompt-design bug rather than legitimate routing. */
  hasImmediateCycle(): boolean {
    const n = this.chain.length;
    if (n < 3) return false;
    return this.chain[n - 1] === this.chain[n - 3];
  }
}
