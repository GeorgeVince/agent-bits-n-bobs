import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const instructions = readFileSync(
  new URL("../skills/plain-writing/SKILL.md", import.meta.url),
  "utf8",
).replace(/^---\n[\s\S]*?\n---\n/, "");

export function resolvePlainWritingMode(entries: any[]): boolean {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry?.type === "custom" && entry.customType === "plain-writing-mode") {
      return entry.data?.enabled === true;
    }
  }
  return false;
}

export default function plainWritingExtension(pi: ExtensionAPI) {
  let enabled = false;

  const setEnabled = (value: boolean, ctx: any) => {
    enabled = value;
    pi.appendEntry("plain-writing-mode", { enabled });
    ctx.ui.notify(`Plain writing is ${enabled ? "on" : "off"}.`, "info");
  };

  pi.registerCommand("plain-writing", {
    description: "Toggle plain writing mode, or use on, off, status, or deslopify",
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase();

      if (command === "deslopify" || command.startsWith("deslopify ")) {
        pi.sendUserMessage(`/skill:plain-writing ${args.trim()}`, { expandPromptTemplates: true });
      } else if (command === "status") {
        ctx.ui.notify(`Plain writing is ${enabled ? "on" : "off"}.`, "info");
      } else if (!command) {
        setEnabled(!enabled, ctx);
      } else if (command === "on" || command === "off") {
        setEnabled(command === "on", ctx);
      } else {
        ctx.ui.notify("Use /plain-writing on, off, status, or deslopify.", "warning");
      }
    },
  });

  pi.on("session_start", (_event, ctx) => {
    enabled = resolvePlainWritingMode(ctx.sessionManager.getBranch());
  });

  pi.on("before_agent_start", (event) => {
    if (!enabled) return;
    return { systemPrompt: `${event.systemPrompt}\n\nPLAIN WRITING MODE ACTIVE.\n\n${instructions}` };
  });
}
