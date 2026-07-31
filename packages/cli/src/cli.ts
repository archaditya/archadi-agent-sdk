#!/usr/bin/env node
import "dotenv/config";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FileSessionStore, ModelTarget, Runner, SimpleLongTermMemory } from "archadi-agent";
import { buildAgents } from "./agents";
import { registerProvidersFromEnv } from "./providers";
import { startRepl } from "./repl";
import { printError, printSystem } from "./ui";

interface Flags {
  session?: string;
  user?: string;
  provider?: string;
  trace?: boolean;
  memory?: boolean;
  once?: string;
}

function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const [command = "chat", ...rest] = argv;
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--trace") flags.trace = true;
    else if (arg === "--memory") flags.memory = true;
    else if (arg === "--session") flags.session = rest[++i];
    else if (arg === "--user") flags.user = rest[++i];
    else if (arg === "--provider") flags.provider = rest[++i];
    else if (arg === "--once") flags.once = rest.slice(i + 1).join(" ");
  }
  return { command, flags };
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === "help" || command === "--help" || command === "-h") {
    printSystem(
      [
        "ArchadiAgent CLI",
        "",
        "Usage:",
        "  archadi chat [--session <id>] [--user <id>] [--provider openai|claude|gemini] [--trace] [--memory]",
        "  archadi chat --once \"your message\"      run a single turn non-interactively and exit",
        "  archadi help",
        "",
        "Environment (.env):",
        "  OPENAI_API_KEY / OPENAI_MODEL",
        "  ANTHROPIC_API_KEY / ANTHROPIC_MODEL",
        "  GEMINI_API_KEY / GEMINI_MODEL",
      ].join("\n")
    );
    return;
  }

  const available = registerProvidersFromEnv();
  if (available.length === 0) {
    printError(
      "No model provider is configured. Copy .env.example to .env and set at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY."
    );
    process.exitCode = 1;
    return;
  }

  let ordered = available;
  if (flags.provider) {
    const idx = available.findIndex((a) => a.provider === flags.provider);
    if (idx === -1) {
      printError(`Provider "${flags.provider}" is not configured (no API key found for it). Configured: ${available.map((a) => a.provider).join(", ")}`);
      process.exitCode = 1;
      return;
    }
    ordered = [available[idx], ...available.filter((_, i) => i !== idx)];
  }

  const primary: ModelTarget = { provider: ordered[0].provider, model: ordered[0].model, timeoutMs: 45_000 };
  const fallbacks: ModelTarget[] = ordered.slice(1).map((a) => ({ provider: a.provider, model: a.model, timeoutMs: 45_000 }));

  const sessionId = flags.session ?? `cli-${randomUUID().slice(0, 8)}`;
  const userId = flags.user ?? "local-user";
  const sessionStore = new FileSessionStore(path.join(process.cwd(), ".archadi", "sessions.json"));
  const longTermMemory = flags.memory ? new SimpleLongTermMemory() : undefined;

  const { router } = buildAgents({ primary, fallbacks, sessionStore, longTermMemory });
  const runner = new Runner();

  if (flags.once) {
    const result = await runner.run(router, flags.once, { sessionId, userId, metadata: {} });
    console.log(String(result.finalOutput));
    return;
  }

  await startRepl(router, runner, {
    sessionId,
    userId,
    providerLabel: `${ordered[0].label} (${ordered[0].model})${fallbacks.length ? ` +${fallbacks.length} fallback` : ""}`,
    trace: Boolean(flags.trace),
    metadata: {},
  });
}

main().catch((err) => {
  printError(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
