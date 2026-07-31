import { exec } from "node:child_process";
import { z } from "zod";
import { defineTool } from "archadi-agent";
import { WORKDIR } from "./fileTools";

/**
 * Runs a shell command in the sandboxed workspace directory. This is the
 * single most dangerous tool in the demo set, so it's marked
 * `requiresApproval: true` — the Runner will refuse to execute it unless
 * the caller supplied an approvalHandler (the CLI prompts the user; a
 * headless API caller would need to wire up its own approval flow).
 */
export const execTool = defineTool({
  name: "run_shell_command",
  description: `Runs a shell command inside the sandboxed workspace directory (${WORKDIR}) and returns stdout/stderr. Requires human approval.`,
  requiresApproval: true,
  schema: z.object({
    command: z.string().describe("Shell command to run, e.g. 'g++ hello.cpp -o hello && ./hello'"),
  }),
  execute({ command }) {
    return new Promise((resolve) => {
      exec(command, { cwd: WORKDIR, timeout: 20_000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: String(err.message ?? err), stdout, stderr });
        } else {
          resolve({ ok: true, stdout, stderr });
        }
      });
    });
  },
});
