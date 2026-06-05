#!/usr/bin/env node
/**
 * summarize skill — fetch a URL or convert a local file to Markdown via `uvx markitdown[pdf]`.
 *
 * By default the full Markdown is written to a temp .md file and only the path + a short
 * preview are printed, so large documents never flood the agent's context. Use the pi
 * `read` tool (with offset/limit) on the printed path to inspect the full content.
 *
 * Usage:
 *   node to-markdown.mjs <url-or-path>                # -> temp .md + path + preview
 *   node to-markdown.mjs <url-or-path> --stdout       # full Markdown to stdout
 *   node to-markdown.mjs <url-or-path> --out doc.md   # write to a specific file
 *   node to-markdown.mjs <url-or-path> --summary [--prompt "focus/audience"]
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const isFlag = (s) => typeof s === "string" && s.startsWith("--");
const isUrl = (s) => /^https?:\/\//i.test(s);

function usage(code = 1) {
  console.error(
    "Usage: node to-markdown.mjs <url-or-path> [--stdout] [--out <file>] [--summary [prompt]] [--prompt <text>]",
  );
  process.exit(code);
}

// --- parse args ---
let input = null;
let outPath = null;
let toStdout = false;
let doSummary = false;
let summaryPrompt = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--help" || a === "-h") usage(0);
  if (a === "--stdout") {
    toStdout = true;
    continue;
  }
  if (a === "--out") {
    outPath = argv[++i];
    if (!outPath || isFlag(outPath)) {
      console.error("Expected a value after --out");
      process.exit(1);
    }
    continue;
  }
  if (a === "--prompt" || a === "--summary-prompt") {
    summaryPrompt = argv[++i];
    if (!summaryPrompt || isFlag(summaryPrompt)) {
      console.error(`Expected a value after ${a}`);
      process.exit(1);
    }
    continue;
  }
  if (a === "--summary") {
    doSummary = true;
    const next = argv[i + 1];
    if (input && next && !isFlag(next) && summaryPrompt == null) {
      summaryPrompt = next;
      i++;
    }
    continue;
  }
  if (isFlag(a)) {
    console.error(`Unknown flag: ${a}`);
    usage(1);
  }
  if (!input) input = a;
  else if (doSummary && summaryPrompt == null) summaryPrompt = a;
  else {
    console.error(`Unexpected argument: ${a}`);
    usage(1);
  }
}
if (!input) usage(1);

function safeName(s) {
  return (s || "document").replace(/[^a-z0-9._-]+/gi, "_");
}

function inputBase(s) {
  if (isUrl(s)) {
    try {
      return safeName(basename(new URL(s).pathname) || "document");
    } catch {
      return "document";
    }
  }
  return safeName(basename(s));
}

function makeTmpMdPath(s) {
  const dir = join(tmpdir(), "pi-summarize");
  mkdirSync(dir, { recursive: true });
  const base = inputBase(s).replace(/\.[^.]+$/, "") || "document";
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(16).slice(2, 8);
  return join(dir, `${base}-${stamp}-${rand}.md`);
}

function runMarkitdown(arg) {
  // Always include the [pdf] extra: many document URLs are only detected as PDF
  // after fetching, so extension-based switching is unreliable.
  const r = spawnSync("uvx", ["--from", "markitdown[pdf]", "markitdown", arg], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new Error(`Failed to run uvx markitdown: ${r.error.message}`);
  if (r.status !== 0) {
    const stderr = (r.stderr || "").trim();
    throw new Error(`markitdown failed for ${arg}${stderr ? `\n${stderr}` : ""}`);
  }
  return r.stdout;
}

function summarizeWithPi(markdown, { mdPath, extraPrompt }) {
  const MAX = 140_000;
  let body = markdown;
  let truncated = false;
  if (body.length > MAX) {
    const head = body.slice(0, 110_000);
    const tail = body.slice(-20_000);
    body = `${head}\n\n[...TRUNCATED ${body.length - head.length - tail.length} chars...]\n\n${tail}`;
    truncated = true;
  }

  const focus = extraPrompt
    ? `Follow these instructions closely:\n${extraPrompt}\n`
    : `No extra focus was provided; produce a general-purpose summary.\n`;

  const prompt = `You are summarizing a document converted to Markdown${mdPath ? ` (full copy at ${mdPath})` : ""}.
${focus}
Produce:
- a 1-paragraph executive summary
- 8-15 bullets of key facts / decisions / numbers
- an "Open questions / missing info" section
Be concise; preserve important names, numbers, and constraints.${truncated ? "\nNote: input was truncated due to size." : ""}

--- BEGIN DOCUMENT ---
${body}
--- END DOCUMENT ---`;

  const r = spawnSync(
    "pi",
    ["--model", "claude-haiku-4-5", "--no-tools", "--no-session", "-p", prompt],
    { encoding: "utf-8", maxBuffer: 20 * 1024 * 1024, timeout: 180_000 },
  );
  if (r.error) throw new Error(`Failed to run pi: ${r.error.message}`);
  if (r.status !== 0) {
    const stderr = (r.stderr || "").trim();
    throw new Error(`pi failed${stderr ? `\n${stderr}` : ""}`);
  }
  return (r.stdout || "").trim();
}

function main() {
  if (!isUrl(input) && !existsSync(input)) throw new Error(`File not found: ${input}`);

  const md = runMarkitdown(input);

  if (toStdout) {
    process.stdout.write(md);
    return;
  }

  const savedPath = outPath || makeTmpMdPath(input);
  writeFileSync(savedPath, md, "utf-8");

  if (doSummary) {
    const summary = summarizeWithPi(md, { mdPath: savedPath, extraPrompt: summaryPrompt });
    process.stdout.write(`${summary}\n\n[Full Markdown saved to: ${savedPath}]\n`);
    return;
  }

  const lineCount = md.split("\n").length;
  const previewChars = 2000;
  const preview = md.length > previewChars ? `${md.slice(0, previewChars)}\n…[preview truncated]` : md;
  process.stdout.write(
    `Converted: ${input}\n` +
      `Markdown saved to: ${savedPath}\n` +
      `Size: ${md.length} chars, ${lineCount} lines\n` +
      `Tip: use the \`read\` tool on the path above (offset/limit) to inspect the full content.\n\n` +
      `--- preview ---\n${preview}\n`,
  );
}

try {
  main();
} catch (err) {
  console.error(err?.message || String(err));
  process.exit(1);
}
