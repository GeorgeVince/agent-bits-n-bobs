import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  if (process.env.HERDR_ENV !== "1") return;

  let agentActive = false;
  let blocked = false;

  const clearBlock = () => {
    if (!blocked) return;
    blocked = false;
    pi.events.emit("herdr:blocked", { active: false });
  };

  pi.on("session_start", (_event, ctx) => {
    agentActive = !ctx.isIdle();
  });
  pi.on("agent_start", () => {
    agentActive = true;
  });
  pi.on("agent_settled", () => {
    agentActive = false;
    clearBlock();
  });

  pi.events.on("request-attention", (data) => {
    if (!agentActive || blocked) return;
    blocked = true;
    pi.events.emit("herdr:blocked", {
      active: true,
      label: typeof data?.message === "string" ? data.message : "Pi needs attention",
    });
  });
}
