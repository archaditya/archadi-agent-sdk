import { EventEmitter } from "node:events";

/**
 * The full catalogue of runtime events a Runner emits while executing an
 * agent loop. Consumers can subscribe via `runner.on(...)`, or consume the
 * equivalent async-iterator stream produced by `runner.runStream(...)`.
 */
export interface AgentEventMap {
  run_started: { runId: string; agentName: string; input: unknown };
  text_delta: { runId: string; agentName: string; delta: string };
  tool_started: { runId: string; agentName: string; toolName: string; input: unknown; callId: string };
  tool_completed: { runId: string; agentName: string; toolName: string; output: unknown; callId: string; durationMs: number };
  tool_failed: { runId: string; agentName: string; toolName: string; error: string; callId: string };
  guardrail_triggered: { runId: string; stage: "input" | "output" | "tool"; guardrailName: string; reason: string };
  handoff_started: { runId: string; fromAgent: string; toAgent: string };
  handoff_completed: { runId: string; fromAgent: string; toAgent: string };
  retry: { runId: string; attempt: number; maxAttempts: number; reason: string };
  run_completed: { runId: string; agentName: string; output: unknown; durationMs: number };
  run_failed: { runId: string; agentName: string; error: string };
}

export type AgentEventName = keyof AgentEventMap;

/**
 * Strongly typed wrapper around Node's EventEmitter. Each Runner run gets
 * its own AgentEventBus instance so listeners never leak across runs.
 */
export class AgentEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Runs can legitimately have many listeners (UI, tracing, logging, etc).
    this.emitter.setMaxListeners(50);
  }

  emit<K extends AgentEventName>(event: K, payload: AgentEventMap[K]): void {
    this.emitter.emit(event, payload);
    this.emitter.emit("*", { type: event, payload });
  }

  on<K extends AgentEventName>(event: K, listener: (payload: AgentEventMap[K]) => void): () => void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return () => this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  onAny(listener: (evt: { type: AgentEventName; payload: unknown }) => void): () => void {
    this.emitter.on("*", listener as (...args: unknown[]) => void);
    return () => this.emitter.off("*", listener as (...args: unknown[]) => void);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

/**
 * Converts an AgentEventBus into an async iterator of discriminated union
 * events, for consumers who prefer `for await (const evt of stream)`.
 */
export function eventBusToAsyncIterable(
  bus: AgentEventBus,
  isTerminal: (evt: { type: AgentEventName; payload: unknown }) => boolean
): AsyncIterable<{ type: AgentEventName; payload: unknown }> {
  const queue: { type: AgentEventName; payload: unknown }[] = [];
  const waiters: ((v: IteratorResult<{ type: AgentEventName; payload: unknown }>) => void)[] = [];
  let done = false;

  const unsubscribe = bus.onAny((evt) => {
    if (done) return;
    if (waiters.length > 0) {
      const resolve = waiters.shift()!;
      resolve({ value: evt, done: false });
    } else {
      queue.push(evt);
    }
    if (isTerminal(evt)) {
      done = true;
      unsubscribe();
      while (waiters.length > 0) {
        waiters.shift()!({ value: undefined as unknown as { type: AgentEventName; payload: unknown }, done: true });
      }
    }
  });

  return {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<{ type: AgentEventName; payload: unknown }>> {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (done) {
            return Promise.resolve({ value: undefined as unknown as { type: AgentEventName; payload: unknown }, done: true });
          }
          return new Promise((resolve) => waiters.push(resolve));
        },
      };
    },
  };
}
