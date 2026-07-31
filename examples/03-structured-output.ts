/**
 * Structured output: force the agent's final answer to match a Zod schema.
 * Invalid JSON is automatically retried with a repair prompt.
 *
 * Run with:  OPENAI_API_KEY=sk-... npx tsx examples/03-structured-output.ts
 */
import { Agent, OpenAIProvider, ProviderRegistry, Runner, structuredOutput, z } from "archadi-agent";

const RecipeSchema = z.object({
  title: z.string(),
  servings: z.number(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
});

async function main() {
  ProviderRegistry.instance().register(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }));

  const agent = Agent.builder<z.infer<typeof RecipeSchema>>()
    .name("RecipeAgent")
    .instructions("You write simple recipes. Always respond with JSON only, matching the schema, no markdown fences.")
    .model({ provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" })
    .outputSchema(structuredOutput(RecipeSchema))
    .build();

  const runner = new Runner();
  const result = await runner.run(agent, "Give me a simple recipe for masala chai.");
  console.log(result.finalOutput.title, "-", result.finalOutput.servings, "servings");
  console.log(result.finalOutput.ingredients);
}

main().catch(console.error);
