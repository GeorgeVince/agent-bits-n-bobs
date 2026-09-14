import type { UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const MODEL = ["openai-codex", "gpt-5.6-luna"] as const;
const SYSTEM_PROMPT = "Write a 2-5 word title for this coding task. Output only the title, with no quotes or punctuation.";

export function cleanTitle(text: string): string | undefined {
  const title = text
    .replace(/[\r\n]+/g, " ")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, "")
    .trim()
    .replace(/^["'`]+|["'`.:;!?]+$/g, "")
    .trim();
  return Array.from(title).slice(0, 50).join("") || undefined;
}

export default function autoTitle(pi: ExtensionAPI) {
  let attempted = false;

  const nameFromPrompt = async (prompt: string, ctx: ExtensionContext) => {
    if (attempted || pi.getSessionName()) return;

    const model = ctx.modelRegistry.find(...MODEL);
    if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) return;
    attempted = true;

    const message: UserMessage = {
      role: "user",
      content: [{ type: "text", text: prompt.slice(0, 2000) }],
      timestamp: Date.now(),
    };

    try {
      const response = await ctx.modelRegistry.complete(
        model,
        { systemPrompt: SYSTEM_PROMPT, messages: [message] },
        { maxTokens: 64, reasoningEffort: "minimal", cacheRetention: "none", signal: ctx.signal },
      );
      const title = cleanTitle(
        response.content
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join(" "),
      );
      if (response.stopReason === "error") {
        ctx.ui.notify(`Auto title failed: ${response.errorMessage ?? "model error"}`, "warning");
      } else if (title && !pi.getSessionName()) {
        pi.setSessionName(title);
      } else if (!title) {
        ctx.ui.notify("Auto title failed: model returned no text", "warning");
      }
    } catch (error) {
      ctx.ui.notify(`Auto title failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    attempted = false;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message" || entry.message.role !== "user") continue;
      const content = entry.message.content;
      const prompt = typeof content === "string"
        ? content
        : content.filter((part) => part.type === "text").map((part) => part.text).join(" ");
      if (prompt.trim()) await nameFromPrompt(prompt, ctx);
      break;
    }
  });

  pi.on("before_agent_start", (event, ctx) => nameFromPrompt(event.prompt, ctx));
}
