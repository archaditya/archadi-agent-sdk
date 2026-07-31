import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { defineTool } from "archadi-agent";

/**
 * Every file tool is sandboxed to a workdir (defaults to ./workspace under
 * the CLI's cwd) so an agent can never read/write outside of it, no matter
 * what the model asks for.
 */
const WORKDIR = path.resolve(process.cwd(), process.env.ARCHADI_WORKDIR ?? "workspace");
fs.mkdirSync(WORKDIR, { recursive: true });

function resolveSafe(relativePath: string): string {
  const resolved = path.resolve(WORKDIR, relativePath);
  if (!resolved.startsWith(WORKDIR)) {
    throw new Error(`Path "${relativePath}" escapes the sandboxed workspace directory.`);
  }
  return resolved;
}

export const writeFileTool = defineTool({
  name: "write_file",
  description: `Writes a text file inside the sandboxed workspace directory (${WORKDIR}). Creates parent folders as needed.`,
  schema: z.object({
    path: z.string().describe("Path relative to the workspace directory, e.g. 'hello.cpp'"),
    content: z.string().describe("Full file contents to write"),
  }),
  async execute({ path: relPath, content }) {
    const full = resolveSafe(relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
    return { written: relPath, bytes: Buffer.byteLength(content) };
  },
});

export const readFileTool = defineTool({
  name: "read_file",
  description: `Reads a text file from the sandboxed workspace directory (${WORKDIR}).`,
  schema: z.object({
    path: z.string().describe("Path relative to the workspace directory"),
  }),
  async execute({ path: relPath }) {
    const full = resolveSafe(relPath);
    if (!fs.existsSync(full)) throw new Error(`File not found: ${relPath}`);
    return { path: relPath, content: fs.readFileSync(full, "utf-8") };
  },
});

export const listFilesTool = defineTool({
  name: "list_files",
  description: `Lists files inside the sandboxed workspace directory (${WORKDIR}).`,
  schema: z.object({
    subpath: z.string().optional().describe("Optional subdirectory to list, relative to the workspace root"),
  }),
  execute({ subpath }) {
    const full = resolveSafe(subpath ?? ".");
    if (!fs.existsSync(full)) return { files: [] };
    return { files: fs.readdirSync(full) };
  },
});

export const calculatorTool = defineTool({
  name: "calculator",
  description: "Evaluates a basic arithmetic expression (+ - * / ( ) %, decimals). No variables, no functions.",
  schema: z.object({
    expression: z.string().describe("e.g. '2 + 2 - 5 * 10 / 3'"),
  }),
  execute({ expression }) {
    if (!/^[\d\s+\-*/().%]+$/.test(expression)) {
      throw new Error("Expression contains disallowed characters.");
    }
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${expression});`)();
    return { expression, value };
  },
});

export { WORKDIR };
