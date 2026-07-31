/**
 * Streaming output events, an input guardrail, and a printed trace.
 *
 * Run with:  OPENAI_API_KEY=sk-... npx tsx examples/04-streaming-guardrails-tracing.ts
 */
import { Agent, OpenAIProvider, ProviderRegistry, Runner, maxLengthGuardrail } from "archadi-agent";

async function main() {
  ProviderRegistry.instance().register(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }));

  const agent = Agent.builder()
    .name("StoryAgent")
    .instructions("You write very short (3 sentence) stories.")
    .model({ provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" })
    .inputGuardrail(maxLengthGuardrail(500))
    .build();

  const runner = new Runner();
  const { events, result } = runner.runStream(agent, "Write a tiny story about a robot learning to cook.");

  for await (const evt of events) {
    if (evt.type === "text_delta") process.stdout.write((evt.payload as any).delta);
    if (evt.type === "run_completed") process.stdout.write("\n");
  }

  const final = await result;
  console.log("\n--- trace ---");
  console.log(final.trace.toPrettyString());
}

main().catch(console.error);
