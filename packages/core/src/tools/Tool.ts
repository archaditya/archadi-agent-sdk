import { z, ZodSchema } from "zod";
import { ToolExecutionError, ToolValidationError } from "../errors/AgentErrors";
import { zodToJsonSchema } from "../structured/zodToJsonSchema";

export interface ToolContext {
  runId: string;
  agentName: string;
  sessionId?: string;
  /** Arbitrary data the host app injects — e.g. a user id, api key id, request-scoped clients. */
  metadata: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ToolResult<TOutput = unknown> {
  ok: boolean;
  output?: TOutput;
  error?: string;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  /** Zod schema used both for runtime validation and for JSON-schema generation sent to the model. */
  schema: ZodSchema<TInput>;
  /** Marks the tool as requiring human/guardrail approval before execution. */
  requiresApproval?: boolean;
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput> | TOutput;
}

/**
 * A Tool wraps a ToolDefinition with validation, error isolation, and
 * JSON-schema generation so the agent runtime can hand it straight to any
 * ModelProvider.
 */
export class Tool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly schema: ZodSchema<TInput>;
  readonly requiresApproval: boolean;
  private readonly executor: (input: TInput, ctx: ToolContext) => Promise<TOutput> | TOutput;

  constructor(definition: ToolDefinition<TInput, TOutput>) {
    this.name = definition.name;
    this.description = definition.description;
    this.schema = definition.schema;
    this.requiresApproval = definition.requiresApproval ?? false;
    this.executor = definition.execute;
  }

  toJsonSchema(): Record<string, unknown> {
    return zodToJsonSchema(this.schema);
  }

  /** Validates input, runs the tool, and normalizes both success and failure into a ToolResult. */
  async run(rawInput: unknown, ctx: ToolContext): Promise<ToolResult<TOutput>> {
    const parsed = this.schema.safeParse(rawInput);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      throw new ToolValidationError(this.name, message, parsed.error);
    }
    try {
      const output = await this.executor(parsed.data, ctx);
      return { ok: true, output };
    } catch (err) {
      if (err instanceof ToolValidationError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new ToolExecutionError(this.name, message, err);
    }
  }
}

/**
 * ToolBuilder — fluent builder pattern for constructing tools without
 * hand-rolling a ToolDefinition object literal.
 *
 * const weatherTool = new ToolBuilder()
 *   .name("get_weather")
 *   .description("Look up current weather for a city")
 *   .schema(z.object({ city: z.string() }))
 *   .execute(async ({ city }) => fetchWeather(city))
 *   .build();
 */
export class ToolBuilder<TInput = unknown, TOutput = unknown> {
  private _name?: string;
  private _description?: string;
  private _schema?: ZodSchema<TInput>;
  private _requiresApproval = false;
  private _execute?: (input: TInput, ctx: ToolContext) => Promise<TOutput> | TOutput;

  name(name: string): this {
    this._name = name;
    return this;
  }

  description(description: string): this {
    this._description = description;
    return this;
  }

  schema<T>(schema: ZodSchema<T>): ToolBuilder<T, TOutput> {
    (this as unknown as ToolBuilder<T, TOutput>)._schema = schema;
    return this as unknown as ToolBuilder<T, TOutput>;
  }

  requiresApproval(value = true): this {
    this._requiresApproval = value;
    return this;
  }

  execute(fn: (input: TInput, ctx: ToolContext) => Promise<TOutput> | TOutput): this {
    this._execute = fn;
    return this;
  }

  build(): Tool<TInput, TOutput> {
    if (!this._name) throw new Error("ToolBuilder: name(...) is required");
    if (!this._description) throw new Error("ToolBuilder: description(...) is required");
    if (!this._execute) throw new Error("ToolBuilder: execute(...) is required");
    return new Tool<TInput, TOutput>({
      name: this._name,
      description: this._description,
      schema: this._schema ?? (z.object({}) as unknown as ZodSchema<TInput>),
      requiresApproval: this._requiresApproval,
      execute: this._execute,
    });
  }
}

/** Convenience function for the common case — skips the builder ceremony. */
export function defineTool<TInput, TOutput>(definition: ToolDefinition<TInput, TOutput>): Tool<TInput, TOutput> {
  return new Tool(definition);
}
