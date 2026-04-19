import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const SCREENSHOT_DIR = join(homedir(), "Desktop");

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

async function getRecentScreenshots(count: number = 1) {
  await access(SCREENSHOT_DIR).catch(() => {
    throw new Error("Desktop directory not found at " + SCREENSHOT_DIR);
  });

  const files = await readdir(SCREENSHOT_DIR);
  const screenshots = files.filter(
    (f) => f.startsWith("Screenshot ") && /\.(png|jpg|jpeg|gif|webp)$/i.test(f)
  );

  // Get modification times and sort by most recent
  const withStats = await Promise.all(
    screenshots.map(async (f) => {
      const fullPath = join(SCREENSHOT_DIR, f);
      const fileStat = await stat(fullPath);
      return { name: f, path: fullPath, mtime: fileStat.mtimeMs };
    })
  );

  withStats.sort((a, b) => b.mtime - a.mtime);
  return withStats.slice(0, count);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "last_screenshot",
    label: "Last Screenshot",
    description:
      "Get the most recent screenshot(s) from the user's Desktop. Use this when the user refers to their last screenshot, a recent screenshot, or asks you to look at what's on their screen.",
    promptSnippet:
      "Retrieve the user's most recent screenshot(s) from ~/Desktop",
    promptGuidelines: [
      "When the user says 'look at my last screenshot', 'check my screenshot', 'what's on my screen', or similar, use the last_screenshot tool.",
    ],
    parameters: Type.Object({
      count: Type.Optional(
        Type.Number({
          description: "Number of recent screenshots to retrieve (default: 1, max: 5)",
          minimum: 1,
          maximum: 5,
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const count = Math.min(params.count ?? 1, 5);

      try {
        const screenshots = await getRecentScreenshots(count);

        if (screenshots.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No screenshots found on the Desktop.",
              },
            ],
            details: {},
          };
        }

        const content: ({ type: "text"; text: string } | { type: "image"; mimeType: string; data: string })[] = [];

        for (const ss of screenshots) {
          try {
            const data = await readFile(ss.path);
            const base64 = data.toString("base64");
            const ext = ss.name.split(".").pop()?.toLowerCase() ?? "png";
            const mediaType = MIME_TYPES[ext] ?? "image/png";

            content.push({
              type: "text" as const,
              text: `Screenshot: ${ss.name}`,
            });
            content.push({
              type: "image" as const,
              mimeType: mediaType,
              data: base64,
            });
          } catch {
            // Skip files that were deleted between listing and reading
          }
        }

        return { content, details: {} };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reading screenshots: ${err.message}`,
            },
          ],
          details: {},
          isError: true,
        };
      }
    },
  });
}
