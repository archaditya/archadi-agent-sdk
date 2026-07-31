import readline from "node:readline";
import chalk from "chalk";
import { Agent, ApprovalHandler, Runner } from "archadi-agent";
import {
  banner,
  printAssistant,
  printError,
  printGuardrail,
  printHandoff,
  printRetry,
  printSystem,
  printToolEnd,
  printToolFailed,
  printToolStart,
  printTrace,
} from "./ui";

export interface ReplOptions {
  sessionId: string;
  userId: string;
  providerLabel: string;
  trace: boolean;
  metadata?: Record<string, unknown>;
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function approvalHandler(rl: readline.Interface): ApprovalHandler {
  return async ({ toolName, input, reason }) => {
    const suffix = reason ? ` (${reason})` : "";
    const ans = await question(
      rl,
      chalk.yellow(`  ⚠ "${toolName}" wants to run with input ${JSON.stringify(input)}${suffix}. Approve? [y/N] `)
    );
    return ans.trim().toLowerCase().startsWith("y");
  };
}

export async function startRepl(router: Agent<string>, runner: Runner, options: ReplOptions): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: chalk.cyanBright("you › ") });

  console.log(banner());
  printSystem(
    `session: ${options.sessionId}  |  provider: ${options.providerLabel}  |  trace: ${options.trace ? "on" : "off"}  |  memory: ${
      router.longTermMemory ? "on" : "off"
    }`
  );
  printSystem("Type /help to see commands. Try: \"what's the weather in Goa\" or \"write a hello world in c++ and run it\".\n");

  const onApproval = approvalHandler(rl);

  rl.prompt();

  rl.on("line", async (raw) => {
    const line = raw.trim();
    if (!line) return rl.prompt();

    if (line.startsWith("/")) {
      handleCommand(line, options);
      return rl.prompt();
    }

    rl.pause();
    try {
      const { events, result } = runner.runStream(router, line, {
        sessionId: options.sessionId,
        userId: options.userId,
        metadata: options.metadata,
        approvalHandler: onApproval,
      });

      let currentStreamedAgent: string | null = null;
      let printedAnyText = false;

      for await (const evt of events) {
        switch (evt.type) {
          case "text_delta": {
            const p = evt.payload as any;
            if (currentStreamedAgent !== p.agentName) {
              if (currentStreamedAgent !== null) process.stdout.write("\n");
              process.stdout.write(`${chalk.magentaBright(`\n${p.agentName}`)} ${chalk.gray("›")} `);
              currentStreamedAgent = p.agentName;
            }
            process.stdout.write(p.delta);
            printedAnyText = true;
            break;
          }
          case "tool_started": {
            if (currentStreamedAgent !== null) {
              process.stdout.write("\n");
              currentStreamedAgent = null;
            }
            const p = evt.payload as any;
            printToolStart(p.toolName, p.input);
            break;
          }
          case "tool_completed": {
            const p = evt.payload as any;
            printToolEnd(p.toolName, p.durationMs);
            break;
          }
          case "tool_failed": {
            const p = evt.payload as any;
            printToolFailed(p.toolName, p.error);
            break;
          }
          case "handoff_started": {
            if (currentStreamedAgent !== null) {
              process.stdout.write("\n");
              currentStreamedAgent = null;
            }
            const p = evt.payload as any;
            printHandoff(p.fromAgent, p.toAgent);
            break;
          }
          case "guardrail_triggered": {
            const p = evt.payload as any;
            printGuardrail(p.stage, p.guardrailName, p.reason);
            break;
          }
          case "retry": {
            const p = evt.payload as any;
            printRetry(p.reason, p.attempt, p.maxAttempts);
            break;
          }
          default:
            break;
        }
      }

      if (currentStreamedAgent !== null) {
        process.stdout.write("\n");
      }

      const finalResult = await result;
      if (!printedAnyText) {
        printAssistant(finalResult.agentName, String(finalResult.finalOutput));
      }
      if (options.trace) {
        printTrace(finalResult.trace.toPrettyString());
      }
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
    } finally {
      rl.resume();
      rl.prompt();
    }
  });

  rl.on("close", () => {
    printSystem("\nbye 👋");
    process.exit(0);
  });
}

function handleCommand(line: string, options: ReplOptions): void {
  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  switch (cmd) {
    case "help":
      printSystem(
        [
          "Commands:",
          "  /help            show this message",
          "  /trace           toggle run tracing output",
          "  /session         show current session id",
          "  /exit            quit",
        ].join("\n")
      );
      break;
    case "trace":
      options.trace = !options.trace;
      printSystem(`trace is now ${options.trace ? "on" : "off"}`);
      break;
    case "session":
      printSystem(`current session id: ${options.sessionId}`);
      break;
    case "exit":
    case "quit":
      process.exit(0);
      break;
    default:
      printSystem(`unknown command: /${cmd}. Type /help.`);
  }
}
