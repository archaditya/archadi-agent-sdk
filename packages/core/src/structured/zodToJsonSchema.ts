import { z } from "zod";

/**
 * A small, dependency-free Zod -> JSON Schema converter covering the subset
 * of Zod used for tool parameters and structured outputs (object, string,
 * number, boolean, array, enum, literal, optional, nullable, default,
 * union). This keeps the SDK's dependency footprint to just `zod` itself.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = (schema as any)._def;

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!isOptional(value)) required.push(key);
    }
    return { type: "object", properties, required, additionalProperties: false };
  }

  if (schema instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: "string" };
    if (schema.description) out.description = schema.description;
    return out;
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number", ...(schema.description ? { description: schema.description } : {}) };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean", ...(schema.description ? { description: schema.description } : {}) };
  }

  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchema(def.type) };
  }

  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: def.values };
  }

  if (schema instanceof z.ZodLiteral) {
    return { const: def.value };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(def.innerType);
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(def.innerType) as { type?: string };
    return { ...inner, nullable: true };
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(def.innerType);
    return { ...inner, default: def.defaultValue() };
  }

  if (schema instanceof z.ZodUnion) {
    return { anyOf: def.options.map((opt: z.ZodTypeAny) => zodToJsonSchema(opt)) };
  }

  if (schema instanceof z.ZodRecord) {
    return { type: "object", additionalProperties: zodToJsonSchema(def.valueType) };
  }

  // Fallback: accept anything.
  return {};
}

function isOptional(schema: z.ZodTypeAny): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault;
}
