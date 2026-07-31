# Quick Start

## 1. The CLI (zero code)

```bash
npm run chat
```

```
you › what's the weather in Goa?
  ↪ handoff: RouterAgent → WeatherAgent
  ⚙ calling get_weather({"city":"Goa"})
  ✓ get_weather done (612ms)
WeatherAgent › It's sunny in Goa right now, around 31°C (feels like 34°C)...
```

Try:
- `write a hello world program in c++ and run it` → hands off to `CoderAgent`, writes `hello.cpp`, then asks approval before running `g++ ...`
- `what's 12 * (4 + 7) / 2` → answered directly with the calculator tool
- `/trace` → toggle per-turn execution traces
- `/help` → list commands

## 2. The SDK (3 lines to a running agent)

```ts
import { Agent, Runner, OpenAIProvider, ProviderRegistry } from "archadi-agent";

ProviderRegistry.instance().register(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }));

const agent = Agent.builder()
  .name("Assistant")
  .instructions("You are a helpful assistant.")
  .model({ provider: "openai", model: "gpt-4o-mini" })
  .build();

const result = await new Runner().run(agent, "Say hi in 5 words.");
console.log(result.finalOutput);
```

See [`/examples`](../examples) for tools, handoffs, structured output, and streaming.
