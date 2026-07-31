# Installation

## Option A — Use the CLI (recommended first step)

```bash
git clone https://github.com/<your-username>/archadi-agent-sdk.git
cd archadi-agent-sdk
npm install          # installs + builds both workspaces (core SDK + CLI)
cp .env.example .env # add at least one API key
npm run chat         # start the interactive REPL
```

`npm install` runs a `postinstall`-free but explicit `npm run build` internally isn't automatic — if you ever see stale behavior after editing source, just run:

```bash
npm run build
```

## Option B — Use the SDK as a library in your own project

The SDK package lives at `packages/core` and is named `archadi-agent` in this workspace. To use it outside this repo, publish it (`npm publish` from `packages/core`) or reference it via a local `file:` / `npm link` dependency:

```bash
cd packages/core
npm run build
npm link

cd /path/to/your/project
npm link archadi-agent
```

```ts
import { Agent, Runner, OpenAIProvider, ProviderRegistry } from "archadi-agent";
```

## Requirements

- Node.js 20+
- An API key for at least one of: OpenAI, Anthropic (Claude), Google (Gemini)
- Optionally, a [Mem0](https://mem0.ai) API key if you want hosted long-term memory (`--memory` in the CLI works without one, using a built-in local fallback)
