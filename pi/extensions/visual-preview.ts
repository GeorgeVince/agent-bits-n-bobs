import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";
import { access, realpath, readdir, stat } from "node:fs/promises";
import path from "node:path";

type OpenResult = {
  command: string;
  args: string[];
};

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveVisualPath(ctx: ExtensionContext, inputPath: string): Promise<string> {
  const visualsDir = path.resolve(ctx.cwd, ".pi", "visuals");
  const realVisualsDir = await realpath(visualsDir).catch(() => {
    throw new Error(`Visuals directory does not exist: ${visualsDir}`);
  });

  const candidate = path.isAbsolute(inputPath) ? inputPath : path.resolve(ctx.cwd, inputPath);
  await access(candidate).catch(() => {
    throw new Error(`Preview file does not exist: ${candidate}`);
  });

  const realCandidate = await realpath(candidate);
  if (!isInside(realCandidate, realVisualsDir)) {
    throw new Error(`Refusing to preview files outside ${realVisualsDir}: ${realCandidate}`);
  }

  const extension = path.extname(realCandidate).toLowerCase();
  if (extension !== ".html" && extension !== ".htm") {
    throw new Error(`Refusing to preview non-HTML file: ${realCandidate}`);
  }

  const fileStat = await stat(realCandidate);
  if (!fileStat.isFile()) {
    throw new Error(`Preview path is not a file: ${realCandidate}`);
  }

  return realCandidate;
}

async function latestVisual(ctx: ExtensionContext): Promise<string> {
  const visualsDir = path.resolve(ctx.cwd, ".pi", "visuals");
  const entries = await readdir(visualsDir, { withFileTypes: true }).catch(() => {
    throw new Error(`Visuals directory does not exist: ${visualsDir}`);
  });

  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name) && !entry.name.endsWith(".fragment.html"))
      .map(async (entry) => {
        const filePath = path.join(visualsDir, entry.name);
        const fileStat = await stat(filePath);
        return { path: filePath, mtimeMs: fileStat.mtimeMs };
      }),
  );

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latest = candidates[0];
  if (!latest) throw new Error(`No HTML previews found in ${visualsDir}`);
  return resolveVisualPath(ctx, latest.path);
}

function openCommand(filePath: string): OpenResult {
  if (process.platform === "darwin") return { command: "open", args: [filePath] };
  if (process.platform === "win32") return { command: "cmd", args: ["/c", "start", "", filePath] };
  return { command: "xdg-open", args: [filePath] };
}

async function openFile(filePath: string, signal?: AbortSignal): Promise<OpenResult> {
  const { command, args } = openCommand(filePath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      detached: false,
    });

    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out while opening ${filePath}`));
    }, 10_000);

    const onAbort = () => {
      child.kill("SIGTERM");
      reject(new Error("Preview open cancelled"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4096) stderr = stderr.slice(-4096);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });

  return { command, args };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "visual_preview",
    label: "Visual Preview",
    description:
      "Open a generated visual preview in the user's browser. Only opens .html/.htm files inside the current project's .pi/visuals directory. Use this instead of shelling out to `open` so previews work while pi-sandbox is enabled.",
    promptSnippet: "Open generated visual previews from .pi/visuals in the user's browser",
    promptGuidelines: [
      "After rendering a visual to .pi/visuals/*.html, use visual_preview to show it to the user.",
      "Do not use bash `open` or render-visual.mjs --open for visual previews when pi-sandbox is enabled.",
      "Only pass paths to generated .html files under the current project's .pi/visuals directory.",
    ],
    parameters: Type.Object({
      path: Type.Optional(
        Type.String({
          description:
            "Path to a generated .html/.htm preview under .pi/visuals. If omitted, opens the most recent preview.",
        }),
      ),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const previewPath = params.path ? await resolveVisualPath(ctx, params.path) : await latestVisual(ctx);
      const result = await openFile(previewPath, signal);

      return {
        content: [
          {
            type: "text" as const,
            text: `Opened visual preview: ${previewPath}`,
          },
        ],
        details: {
          path: previewPath,
          command: result.command,
          args: result.args,
        },
      };
    },
  });

  pi.registerCommand("visual-preview", {
    description: "Open a generated HTML visual from .pi/visuals, or the latest one if no path is given",
    handler: async (args, ctx) => {
      try {
        const inputPath = args.trim();
        const previewPath = inputPath ? await resolveVisualPath(ctx, inputPath) : await latestVisual(ctx);
        await openFile(previewPath);
        ctx.ui.notify(`Opened visual preview:\n${previewPath}`, "info");
      } catch (error) {
        ctx.ui.notify(`Visual preview failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}
