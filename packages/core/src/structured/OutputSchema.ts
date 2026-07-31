import { z, ZodSchema } from "zod";
import { StructuredOutputError } from "../errors/AgentErrors";
import { zodToJsonSchema } from "./zodToJsonSchema";

/**
 * Wraps a Zod schema so the Runner can both (a) send a JSON-schema hint to
 * the model provider and (b) validate/parse the model's final text output
 * against it, producing a fully-typed result.
 */
export class OutputSchema<T> {
  constructor(public readonly schema: ZodSchema<T>) {}

  toJsonSchema(): Record<string, unknown> {
    return zodToJsonSchema(this.schema);
  }

  /** Parses raw model text as JSON then validates against the schema. Throws StructuredOutputError on failure. */
  parse(rawText: string): T {
    let json: unknown;
    try {
      json = JSON.parse(extractJsonBlock(rawText));
    } catch (err) {
      throw new StructuredOutputError("model output was not valid JSON", { rawText, cause: String(err) });
    }
    const result = this.schema.safeParse(json);
    if (!result.success) {
      throw new StructuredOutputError("model output did not match the expected schema", result.error.issues);
    }
    return result.data;
  }
}

/** Strips markdown code fences (```json ... ```) if the model wrapped its JSON output in them. */
function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : text.trim();
}

/** Convenience factory: `structuredOutput(z.object({ ... }))`. */
export function structuredOutput<T>(schema: ZodSchema<T>): OutputSchema<T> {
  return new OutputSchema(schema);
}

export { z };
