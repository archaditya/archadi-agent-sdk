export type SpanType = "model_call" | "tool_call" | "handoff" | "guardrail" | "retry" | "error";

export interface Span {
  id: string;
  type: SpanType;
  name: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  metadata: Record<string, unknown>;
  error?: string;
}

export interface TraceSummary {
  runId: string;
  agentName: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: "running" | "completed" | "failed";
  spans: Span[];
  totalTokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  finalOutput?: unknown;
  error?: string;
}

/**
 * A Trace records everything that happened during one Runner.run() call:
 * every model call, tool call, handoff, retry, guardrail trip and error,
 * each with timing. Useful for debugging and for the CLI's `--trace` flag.
 */
export class Trace {
  private summary: TraceSummary;
  private openSpans = new Map<string, Span>();
  private counter = 0;

  constructor(runId: string, agentName: string) {
    this.summary = {
      runId,
      agentName,
      startedAt: Date.now(),
      status: "running",
      spans: [],
      totalTokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  startSpan(type: SpanType, name: string, metadata: Record<string, unknown> = {}): string {
    const id = `span_${++this.counter}`;
    const span: Span = { id, type, name, startedAt: Date.now(), metadata };
    this.openSpans.set(id, span);
    this.summary.spans.push(span);
    return id;
  }

  endSpan(id: string, metadata: Record<string, unknown> = {}, error?: string): void {
    const span = this.openSpans.get(id);
    if (!span) return;
    span.endedAt = Date.now();
    span.durationMs = span.endedAt - span.startedAt;
    span.metadata = { ...span.metadata, ...metadata };
    if (error) span.error = error;
    this.openSpans.delete(id);
  }

  recordTokenUsage(usage: { inputTokens: number; outputTokens: number; totalTokens: number }): void {
    this.summary.totalTokenUsage.inputTokens += usage.inputTokens;
    this.summary.totalTokenUsage.outputTokens += usage.outputTokens;
    this.summary.totalTokenUsage.totalTokens += usage.totalTokens;
  }

  complete(finalOutput: unknown): void {
    this.summary.status = "completed";
    this.summary.endedAt = Date.now();
    this.summary.durationMs = this.summary.endedAt - this.summary.startedAt;
    this.summary.finalOutput = finalOutput;
  }

  fail(error: string): void {
    this.summary.status = "failed";
    this.summary.endedAt = Date.now();
    this.summary.durationMs = this.summary.endedAt - this.summary.startedAt;
    this.summary.error = error;
  }

  toJSON(): TraceSummary {
    return this.summary;
  }

  /** Human-readable tree, handy for CLI `--trace` output. */
  toPrettyString(): string {
    const lines: string[] = [];
    lines.push(`Trace ${this.summary.runId} — agent "${this.summary.agentName}" — ${this.summary.status}`);
    if (this.summary.durationMs != null) lines.push(`  total time: ${this.summary.durationMs}ms`);
    lines.push(
      `  tokens: in=${this.summary.totalTokenUsage.inputTokens} out=${this.summary.totalTokenUsage.outputTokens} total=${this.summary.totalTokenUsage.totalTokens}`
    );
    for (const span of this.summary.spans) {
      const dur = span.durationMs != null ? `${span.durationMs}ms` : "…";
      const err = span.error ? ` ERROR: ${span.error}` : "";
      lines.push(`  [${span.type}] ${span.name} (${dur})${err}`);
    }
    return lines.join("\n");
  }
}

/**
 * Tracer — Singleton registry of traces for the lifetime of the process.
 * `Tracer.instance().startTrace(...)` is how a Runner begins recording;
 * the CLI, a dashboard, or tests can later pull any trace by run id.
 */
export class Tracer {
  private static _instance: Tracer | null = null;
  private traces = new Map<string, Trace>();
  private listeners: ((trace: TraceSummary) => void)[] = [];

  private constructor() {}

  static instance(): Tracer {
    if (!Tracer._instance) Tracer._instance = new Tracer();
    return Tracer._instance;
  }

  static resetForTests(): void {
    Tracer._instance = null;
  }

  startTrace(runId: string, agentName: string): Trace {
    const trace = new Trace(runId, agentName);
    this.traces.set(runId, trace);
    return trace;
  }

  get(runId: string): Trace | undefined {
    return this.traces.get(runId);
  }

  all(): TraceSummary[] {
    return [...this.traces.values()].map((t) => t.toJSON());
  }

  /** Subscribe to completed/failed traces — e.g. to ship them to a logging backend. */
  onFinish(listener: (trace: TraceSummary) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  notifyFinished(trace: Trace): void {
    for (const l of this.listeners) l(trace.toJSON());
  }

  clear(): void {
    this.traces.clear();
  }
}
