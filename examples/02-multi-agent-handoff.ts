/**
 * Multi-agent handoff: a router agent delegates to a specialist agent.
 *
 * Run with:  OPENAI_API_KEY=sk-... npx tsx examples/02-multi-agent-handoff.ts
 */
import { Agent, OpenAIProvider, ProviderRegistry, Runner, defineHandoff } from "archadi-agent";

async function main() {
  ProviderRegistry.instance().register(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }));
  const model = { provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" };

  const refundAgent = Agent.builder()
    .name("RefundAgent")
    .instructions("You handle refund requests. Be empathetic and explain the 5-7 business day timeline.")
    .model(model)
    .build();

  const router = Agent.builder()
    .name("SupportRouter")
    .instructions("You triage customer support requests. Hand off refund requests to RefundAgent; answer everything else yourself.")
    .model(model)
    .handoff(defineHandoff({ agent: refundAgent, description: "Use for refund/return requests." }))
    .build();

  const runner = new Runner();
  const result = await runner.run(router, "I want a refund for my last order, it arrived broken.");
  console.log(`Handled by: ${result.agentName}`);
  console.log(result.finalOutput);
}

main().catch(console.error);
