/**
 * Minimal example: one agent, one tool, one run.
 *
 * Run with:  OPENAI_API_KEY=sk-... npx tsx examples/01-basic-agent.ts
 */
import { Agent, OpenAIProvider, ProviderRegistry, Runner, defineTool, z } from "archadi-agent";

const calculator = defineTool({
  name: "calculator",
  description: "Evaluates a basic arithmetic expression",
  schema: z.object({ expression: z.string() }),
  execute({ expression }) {
    // eslint-disable-next-line no-new-func
    return { value: Function(`"use strict"; return (${expression})`)() };
  },
});

async function main() {
  ProviderRegistry.instance().register(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }));

  const agent = Agent.builder()
    .name("MathAgent")
    .instructions("You are a precise math assistant. Use the calculator tool for arithmetic.")
    .model({ provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" })
    .tool(calculator)
    .build();

  const runner = new Runner();
  const result = await runner.run(agent, "What is 2 + 2 - 5 * 10 / 3?");
  console.log(result.finalOutput);
}

main().catch(console.error);
