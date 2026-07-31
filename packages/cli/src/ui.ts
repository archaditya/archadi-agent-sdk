import chalk from "chalk";

export const banner = () => `
${chalk.cyanBright("  ▄▀█ █▀█ █▀▀ █░█ ▄▀█ █▀▄ █")}
${chalk.cyanBright("  █▀█ █▀▄ █▄▄ █▀█ █▀█ █▄▀ █")}
${chalk.gray("  ArchadiAgent CLI — build agents, run them, watch them think.")}
`;

export const printAssistant = (agentName: string, text: string) => {
  console.log(`${chalk.magentaBright(`\n${agentName}`)} ${chalk.gray("›")} ${text}`);
};

export const printToolStart = (toolName: string, input: unknown) => {
  console.log(chalk.yellow(`  ⚙ calling ${toolName}(${truncate(JSON.stringify(input))})`));
};

export const printToolEnd = (toolName: string, ms: number) => {
  console.log(chalk.green(`  ✓ ${toolName} done (${ms}ms)`));
};

export const printToolFailed = (toolName: string, error: string) => {
  console.log(chalk.red(`  ✗ ${toolName} failed: ${error}`));
};

export const printHandoff = (from: string, to: string) => {
  console.log(chalk.blueBright(`  ↪ handoff: ${from} → ${to}`));
};

export const printGuardrail = (stage: string, name: string, reason: string) => {
  console.log(chalk.red(`  ⛔ guardrail [${stage}] ${name}: ${reason}`));
};

export const printRetry = (reason: string, attempt: number, max: number) => {
  console.log(chalk.gray(`  ↻ retrying ${reason} (${attempt}/${max})`));
};

export const printError = (message: string) => {
  console.log(chalk.redBright(`\n✗ ${message}`));
};

export const printSystem = (message: string) => {
  console.log(chalk.gray(message));
};

export const printTrace = (pretty: string) => {
  console.log(chalk.dim("\n─── trace ───────────────────────────"));
  console.log(chalk.dim(pretty));
  console.log(chalk.dim("─────────────────────────────────────"));
};

function truncate(s: string, n = 120): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
