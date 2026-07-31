import { randomUUID } from "node:crypto";
import { Agent } from "../agent/Agent";
import {
  ApprovalRequiredError,
  ConfigurationError,
  GuardrailError,
  HandoffLoopError,
  MaxTurnsExceededError,
  StructuredOutputError,
} from "../errors/AgentErrors";
import { AgentEventBus, eventBusToAsyncIterable } from "../events/AgentEvents";
import { ApprovalHandler, GuardrailContext } from "../guardrails/Guardrail";
import { HandoffGuard } from "../handoff/Handoff";
import { ChatMessage, ModelResponse, ToolCallRequest, ToolSpec } from "../providers/ModelProvider";
import { ProviderRegistry } from "../providers/ProviderRegistry";
import { FallbackTarget, generateWithFallback, streamWithFallback } from "../providers/resilience";
import { Trace } from "../tracing/Tracer";
import { Tracer } from "../tracing/Tracer";
import { ToolContext } from "../tools/Tool";

export interface RunOptions {
  /** Groups turns into one conversation. Defaults to a fresh id (single-turn) if omitted. */
  sessionId?: string;
  /** Scopes long-term memory (mem0) to a particular end-user. */
  userId?: string;
  /** Arbitrary data forwarded into every tool call's context. */
  metadata?: Record<string, unknown>;
  /** Called when a tool/guardrail requires human approval. Omitting it turns approval-required tools into hard errors. */
  approvalHandler?: ApprovalHandler;
  signal?: AbortSignal;
}

export interface RunResult<TOutput> {
  runId: string;
  agentName: string;
  finalOutput: TOutput;
  history: ChatMessage[];
  trace: Trace;
  usedProvider: string;
  usedModel: string;
  durationMs: number;
}

const STRUCTURED_OUTPUT_REPAIR_ATTEMPTS = 2;

/**
 * Runner — executes the agent loop described in the rubric:
 * accept input -> send to LLM -> detect tool calls -> execute tools ->
 * send results back -> repeat until a final answer -> stop at limits.
 *
 * A Runner is stateless and cheap to construct; conversation state lives in
 * the SessionStore, not on the Runner instance, so one Runner safely serves
 * many concurrent runs (this is what the full-stack API layer relies on).
 */
export class Runner {
  constructor(
    private readonly registry: ProviderRegistry = ProviderRegistry.instance(),
    private readonly tracer: Tracer = Tracer.instance()
  ) {}

  async run<TOutput = string>(agent: Agent<TOutput>, input: string, options: RunOptions = {}): Promise<RunResult<TOutput>> {
    const bus = new AgentEventBus();
    return this.execute(agent, input, options, bus, false) as Promise<RunResult<TOutput>>;
  }

  /**
   * Streaming variant. Returns immediately with an async-iterable of events
   * (text deltas, tool lifecycle, handoffs, completion) plus a promise that
   * resolves to the same RunResult `run()` would produce.
   */
  runStream<TOutput = string>(
    agent: Agent<TOutput>,
    input: string,
    options: RunOptions = {}
  ): { events: AsyncIterable<{ type: string; payload: unknown }>; result: Promise<RunResult<TOutput>> } {
    const bus = new AgentEventBus();
    const events = eventBusToAsyncIterable(bus, (evt) => evt.type === "run_completed" || evt.type === "run_failed");
    const result = this.execute(agent, input, options, bus, true) as Promise<RunResult<TOutput>>;
    return { events, result };
  }

  private buildToolSpecs(agent: Agent<any>): ToolSpec[] {
    const toolSpecs: ToolSpec[] = agent.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.toJsonSchema(),
    }));
    const handoffSpecs: ToolSpec[] = agent.handoffs.map((h) => ({
      name: h.toolName,
      description: h.description,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    }));
    return [...toolSpecs, ...handoffSpecs];
  }

  private buildFallbackTargets(agent: Agent<any>): FallbackTarget[] {
    const targets = [agent.model, ...agent.fallbackModels];
    return targets.map((t) => ({
      provider: this.registry.get(t.provider),
      model: t.model,
      timeoutMs: t.timeoutMs,
      retry: t.retry,
    }));
  }

  private async execute<TOutput>(
    initialAgent: Agent<TOutput>,
    input: string,
    options: RunOptions,
    bus: AgentEventBus,
    stream: boolean
  ): Promise<RunResult<TOutput>> {
    const runId = randomUUID();
    const sessionId = options.sessionId ?? runId;
    const startedAt = Date.now();
    const trace = this.tracer.startTrace(runId, initialAgent.name);
    const guardrailCtx: GuardrailContext = { runId, agentName: initialAgent.name, sessionId };

    bus.emit("run_started", { runId, agentName: initialAgent.name, input });

    try {
      // --- input guardrails -------------------------------------------------
      let effectiveInput = input;
      for (const g of initialAgent.inputGuardrails) {
        const spanId = trace.startSpan("guardrail", g.name, { stage: "input" });
        const result = await g.check(effectiveInput, guardrailCtx);
        trace.endSpan(spanId, { pass: result.pass });
        if (!result.pass) {
          bus.emit("guardrail_triggered", { runId, stage: "input", guardrailName: g.name, reason: result.reason ?? "blocked" });
          throw new GuardrailError(g.name, "input", result.reason ?? "input rejected");
        }
        if (typeof result.modifiedData === "string") effectiveInput = result.modifiedData;
      }

      // --- long-term memory recall ------------------------------------------
      let memoryPreamble = "";
      if (initialAgent.longTermMemory && options.userId) {
        const spanId = trace.startSpan("model_call", "memory_recall");
        const facts = await initialAgent.longTermMemory.recall(options.userId, effectiveInput);
        trace.endSpan(spanId, { factsFound: facts.length });
        if (facts.length > 0) {
          memoryPreamble = `\n\nRelevant memories about this user:\n${facts.map((f) => `- ${f}`).join("\n")}`;
        }
      }

      // --- assemble conversation ----------------------------------------------
      const priorHistory = initialAgent.sessionStore ? await initialAgent.sessionStore.getHistory(sessionId) : [];
      let activeAgent: Agent<TOutput> = initialAgent;
      const systemMessage: ChatMessage = {
        role: "system",
        content: activeAgent.resolvedInstructions({ sessionId }) + memoryPreamble,
      };
      const messages: ChatMessage[] = [systemMessage, ...priorHistory, { role: "user", content: effectiveInput }];
      const newMessages: ChatMessage[] = [{ role: "user", content: effectiveInput }];

      const handoffGuard = new HandoffGuard(initialAgent.maxHandoffDepth);
      handoffGuard.visit(activeAgent.name);

      for (let turn = 1; turn <= activeAgent.maxTurns; turn++) {
        const toolSpecs = this.buildToolSpecs(activeAgent);
        const responseSchema = activeAgent.outputSchema?.toJsonSchema();
        const targets = this.buildFallbackTargets(activeAgent);

        const modelSpanId = trace.startSpan("model_call", `turn_${turn}`, { agent: activeAgent.name });

        const requestPayload = {
          messages,
          tools: toolSpecs.length > 0 ? toolSpecs : undefined,
          responseSchema: toolSpecs.length === 0 ? responseSchema : undefined,
          temperature: activeAgent.temperature,
          maxTokens: activeAgent.maxTokens,
          signal: options.signal,
        };

        const onRetryHandler = (providerName: string, attempt: number, maxAttempts: number, err: unknown) => {
          trace.startSpan("retry", providerName, { attempt, maxAttempts, error: String(err) });
          bus.emit("retry", { runId, attempt, maxAttempts, reason: providerName });
        };

        let response: ModelResponse;
        let usedProvider: string;
        let usedModel: string;

        if (stream) {
          // ── Real token-by-token streaming via provider.stream() ──
          const result = await streamWithFallback(
            targets,
            requestPayload,
            (delta) => bus.emit("text_delta", { runId, agentName: activeAgent.name, delta }),
            onRetryHandler
          );
          response = result.response;
          usedProvider = result.usedProvider;
          usedModel = result.usedModel;
        } else {
          // ── Standard non-streaming via provider.generate() ──
          const result = await generateWithFallback(targets, requestPayload, onRetryHandler);
          response = result.response;
          usedProvider = result.usedProvider;
          usedModel = result.usedModel;
        }

        trace.endSpan(modelSpanId, { usedProvider, usedModel, tokens: response.usage });
        trace.recordTokenUsage(response.usage);

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: response.text,
          toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
        };
        messages.push(assistantMessage);
        newMessages.push(assistantMessage);

        // --- no tool calls => this is the final answer -------------------------
        if (response.toolCalls.length === 0) {
          let finalText = response.text;

          for (const g of activeAgent.outputGuardrails) {
            const spanId = trace.startSpan("guardrail", g.name, { stage: "output" });
            const result = await g.check(finalText, guardrailCtx);
            trace.endSpan(spanId, { pass: result.pass });
            if (!result.pass) {
              bus.emit("guardrail_triggered", { runId, stage: "output", guardrailName: g.name, reason: result.reason ?? "blocked" });
              throw new GuardrailError(g.name, "output", result.reason ?? "output rejected");
            }
            if (typeof result.modifiedData === "string") {
              finalText = result.modifiedData;
              bus.emit("guardrail_triggered", { runId, stage: "output", guardrailName: g.name, reason: result.reason ?? "modified output" });
            }
          }

          const finalOutput = await this.resolveStructuredOutput(activeAgent, finalText, messages, targets, trace);

          if (initialAgent.sessionStore) {
            const persisted = [...newMessages];
            persisted[persisted.length - 1] = { ...assistantMessage, content: finalText };
            await initialAgent.sessionStore.appendMessages(sessionId, persisted);
          }
          if (initialAgent.longTermMemory && options.userId) {
            await initialAgent.longTermMemory.remember(options.userId, [
              { role: "user", content: effectiveInput },
              { role: "assistant", content: finalText },
            ]);
          }

          trace.complete(finalOutput);
          this.tracer.notifyFinished(trace);
          const durationMs = Date.now() - startedAt;
          bus.emit("run_completed", { runId, agentName: activeAgent.name, output: finalOutput, durationMs });

          return {
            runId,
            agentName: activeAgent.name,
            finalOutput: finalOutput as TOutput,
            history: messages,
            trace,
            usedProvider,
            usedModel,
            durationMs,
          };
        }

        // --- process tool calls (including handoffs) ---------------------------
        for (const call of response.toolCalls) {
          const handoff = activeAgent.findHandoff(call.toolName);
          if (handoff) {
            handoffGuard.visit(handoff.agent.name);
            if (handoffGuard.exceededMaxDepth() || handoffGuard.hasImmediateCycle()) {
              throw new HandoffLoopError(handoffGuard.path);
            }
            bus.emit("handoff_started", { runId, fromAgent: activeAgent.name, toAgent: handoff.agent.name });
            const handoffSpanId = trace.startSpan("handoff", `${activeAgent.name} -> ${handoff.agent.name}`);

            const toolAck: ChatMessage = {
              role: "tool",
              content: `Transferred to ${handoff.agent.name}.`,
              toolCallId: call.callId,
              toolName: call.toolName,
            };
            messages.push(toolAck);
            newMessages.push(toolAck);

            const nextAgent = handoff.agent as unknown as Agent<TOutput>;
            const filteredInput = handoff.inputFilter
              ? handoff.inputFilter(effectiveInput, JSON.stringify(messages))
              : effectiveInput;
            messages[0] = { role: "system", content: nextAgent.resolvedInstructions({ sessionId }) };
            if (handoff.inputFilter) {
              const bridge: ChatMessage = { role: "user", content: filteredInput };
              messages.push(bridge);
              newMessages.push(bridge);
            }

            activeAgent = nextAgent;
            trace.endSpan(handoffSpanId, { toAgent: nextAgent.name });
            bus.emit("handoff_completed", { runId, fromAgent: guardrailCtx.agentName, toAgent: nextAgent.name });
            continue;
          }

          await this.executeToolCall(activeAgent, call, {
            runId,
            sessionId,
            options,
            messages,
            newMessages,
            bus,
            trace,
            guardrailCtx,
          });
        }
      }

      throw new MaxTurnsExceededError(activeAgent.maxTurns);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      trace.fail(message);
      this.tracer.notifyFinished(trace);
      bus.emit("run_failed", { runId, agentName: initialAgent.name, error: message });
      throw err;
    }
  }

  private async executeToolCall(
    agent: Agent<any>,
    call: ToolCallRequest,
    ctx: {
      runId: string;
      sessionId: string;
      options: RunOptions;
      messages: ChatMessage[];
      newMessages: ChatMessage[];
      bus: AgentEventBus;
      trace: Trace;
      guardrailCtx: GuardrailContext;
    }
  ): Promise<void> {
    const tool = agent.findTool(call.toolName);
    if (!tool) {
      const msg: ChatMessage = {
        role: "tool",
        content: `Error: no tool named "${call.toolName}" is registered on agent "${agent.name}".`,
        toolCallId: call.callId,
        toolName: call.toolName,
      };
      ctx.messages.push(msg);
      ctx.newMessages.push(msg);
      return;
    }

    for (const g of agent.toolGuardrails) {
      const spanId = ctx.trace.startSpan("guardrail", g.name, { stage: "tool", tool: call.toolName });
      const result = await g.check(call.toolName, call.input, ctx.guardrailCtx);
      ctx.trace.endSpan(spanId, { pass: result.pass, requiresApproval: result.requiresApproval });
      if (!result.pass) {
        ctx.bus.emit("guardrail_triggered", { runId: ctx.runId, stage: "tool", guardrailName: g.name, reason: result.reason ?? "blocked" });
        const msg: ChatMessage = {
          role: "tool",
          content: `Error: tool call blocked by guardrail "${g.name}": ${result.reason ?? "blocked"}`,
          toolCallId: call.callId,
          toolName: call.toolName,
        };
        ctx.messages.push(msg);
        ctx.newMessages.push(msg);
        return;
      }
      if (result.requiresApproval || tool.requiresApproval) {
        if (!ctx.options.approvalHandler) {
          throw new ApprovalRequiredError(call.toolName);
        }
        const approved = await ctx.options.approvalHandler({ toolName: call.toolName, input: call.input, reason: result.reason });
        if (!approved) {
          const msg: ChatMessage = {
            role: "tool",
            content: `Tool "${call.toolName}" was not approved for execution.`,
            toolCallId: call.callId,
            toolName: call.toolName,
          };
          ctx.messages.push(msg);
          ctx.newMessages.push(msg);
          return;
        }
      }
    }

    const toolCtx: ToolContext = {
      runId: ctx.runId,
      agentName: agent.name,
      sessionId: ctx.sessionId,
      metadata: ctx.options.metadata ?? {},
      signal: ctx.options.signal,
    };

    const spanId = ctx.trace.startSpan("tool_call", call.toolName, { input: call.input });
    ctx.bus.emit("tool_started", { runId: ctx.runId, agentName: agent.name, toolName: call.toolName, input: call.input, callId: call.callId });
    const startedAt = Date.now();

    try {
      const result = await tool.run(call.input, toolCtx);
      const durationMs = Date.now() - startedAt;
      ctx.trace.endSpan(spanId, { output: result.output, durationMs });
      ctx.bus.emit("tool_completed", {
        runId: ctx.runId,
        agentName: agent.name,
        toolName: call.toolName,
        output: result.output,
        callId: call.callId,
        durationMs,
      });
      const msg: ChatMessage = {
        role: "tool",
        content: typeof result.output === "string" ? result.output : JSON.stringify(result.output),
        toolCallId: call.callId,
        toolName: call.toolName,
      };
      ctx.messages.push(msg);
      ctx.newMessages.push(msg);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.trace.endSpan(spanId, {}, message);
      ctx.bus.emit("tool_failed", { runId: ctx.runId, agentName: agent.name, toolName: call.toolName, error: message, callId: call.callId });
      const msg: ChatMessage = {
        role: "tool",
        content: `Error: ${message}`,
        toolCallId: call.callId,
        toolName: call.toolName,
      };
      ctx.messages.push(msg);
      ctx.newMessages.push(msg);
    }
  }

  /** Validates + parses structured output, retrying with a repair prompt a couple of times if the model produced malformed JSON. */
  private async resolveStructuredOutput<TOutput>(
    agent: Agent<TOutput>,
    finalText: string,
    messages: ChatMessage[],
    targets: FallbackTarget[],
    trace: Trace
  ): Promise<TOutput> {
    if (!agent.outputSchema) return finalText as unknown as TOutput;

    let lastError: StructuredOutputError | null = null;
    let candidate = finalText;

    for (let attempt = 0; attempt <= STRUCTURED_OUTPUT_REPAIR_ATTEMPTS; attempt++) {
      try {
        return agent.outputSchema.parse(candidate);
      } catch (err) {
        if (!(err instanceof StructuredOutputError)) throw err;
        lastError = err;
        if (attempt === STRUCTURED_OUTPUT_REPAIR_ATTEMPTS) break;

        const repairSpan = trace.startSpan("retry", "structured_output_repair", { attempt: attempt + 1 });
        const repairMessages: ChatMessage[] = [
          ...messages,
          {
            role: "user",
            content: `Your previous response did not match the required JSON schema (${JSON.stringify(
              agent.outputSchema.toJsonSchema()
            )}). Error: ${err.message}. Reply again with ONLY valid JSON matching the schema, no prose, no markdown fences.`,
          },
        ];
        const { response } = await generateWithFallback(targets, { messages: repairMessages, responseSchema: agent.outputSchema.toJsonSchema() });
        trace.endSpan(repairSpan, { repairedTextLength: response.text.length });
        candidate = response.text;
      }
    }

    throw lastError ?? new ConfigurationError("Structured output resolution failed unexpectedly");
  }
}
