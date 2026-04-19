import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Catch bare "exit" typed as a message
  pi.on("input", async (event, ctx) => {
    if (event.text.trim().toLowerCase() === "exit") {
      ctx.shutdown();
      return { action: "handled" };
    }
    return { action: "continue" };
  });

  // Keep /exit command too
  pi.registerCommand("exit", {
    description: "Exit pi",
    handler: async (_args, ctx) => {
      ctx.shutdown();
    },
  });
}
