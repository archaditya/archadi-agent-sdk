# CLI Reference

## Setup

```bash
git clone <repo-url> && cd archadi-agent-sdk
npm install
npm run build
cp .env.example .env   # fill in at least one API key
```

## Commands

```bash
npm run chat                                   # interactive REPL, default session
npm run cli -- chat --once "hello there"       # one-shot, prints answer, exits
npm run cli -- chat --trace                    # REPL with execution traces after every turn
npm run cli -- chat --memory                   # enable long-term memory (SimpleLongTermMemory)
npm run cli -- chat --provider claude          # force a specific configured provider
npm run cli -- chat --session my-project       # resume/continue a named session
npm run cli -- help
```

Once built, you can also run it as a global-style binary:

```bash
npm link                       # from repo root
archadi chat
```

## REPL commands

| Command | Effect |
|---|---|
| `/help` | list commands |
| `/trace` | toggle trace output for subsequent turns |
| `/session` | print the current session id |
| `/exit` | quit |

## Demo agents (see `packages/cli/src/agents.ts`)

- **RouterAgent** — general assistant, calculator tool, routes to specialists
- **CoderAgent** — `write_file` / `read_file` / `list_files` (sandboxed to `./workspace`) + `run_shell_command` (requires your `[y/N]` approval)
- **WeatherAgent** — `get_weather` via wttr.in

All three share a `FileSessionStore` at `.archadi/sessions.json`, so conversation history survives across CLI restarts within the same `--session`.

## Environment variables

See [`.env.example`](../.env.example). The CLI auto-registers a provider for every key it finds; with more than one configured, the first available (or `--provider`) is primary and the rest become automatic fallbacks.
