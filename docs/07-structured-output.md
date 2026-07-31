# Structured Output

Force an agent's final answer into a typed shape instead of free text, using a Zod schema:

```ts
import { Agent, structuredOutput, z, Runner } from "archadi-agent";

const RecipeSchema = z.object({
  title: z.string(),
  servings: z.number(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
});

const agent = Agent.builder<z.infer<typeof RecipeSchema>>()
  .name("RecipeAgent")
  .instructions("Respond with JSON only, matching the schema.")
  .model(target)
  .outputSchema(structuredOutput(RecipeSchema))
  .build();

const result = await new Runner().run(agent, "Give me a recipe for chai.");
result.finalOutput.title;        // fully typed — string
result.finalOutput.ingredients;  // string[]
```

## What happens under the hood

1. `OutputSchema.toJsonSchema()` converts your Zod schema to JSON schema and sends it to the provider as a response-format hint (when the agent has no tools active on that turn).
2. When the model returns its final text, `OutputSchema.parse()` strips markdown code fences if present, `JSON.parse`s it, then validates with your Zod schema.
3. **If validation fails**, the Runner doesn't give up — it sends the model a repair prompt containing the exact validation error and asks for corrected JSON, up to `STRUCTURED_OUTPUT_REPAIR_ATTEMPTS` (2) times, before finally throwing `StructuredOutputError` with the Zod issues attached.

## Validation errors

```ts
try {
  await runner.run(agent, "...");
} catch (err) {
  if (err instanceof StructuredOutputError) {
    console.log(err.issues); // Zod issue array — path, message, code
  }
}
```
