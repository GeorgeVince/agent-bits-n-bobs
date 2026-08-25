import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import sandbox from "pi-sandbox";

const PGPASS_PATH = join(homedir(), ".pgpass");

function isPgpassPath(input: string, cwd: string): boolean {
  const path = input.replace(/^@/, "");
  const resolved = path === "~" || path.startsWith("~/")
    ? join(homedir(), path.slice(2))
    : resolve(cwd, path);

  try {
    const candidate = statSync(resolved);
    const pgpass = statSync(PGPASS_PATH);
    return candidate.dev === pgpass.dev && candidate.ino === pgpass.ino;
  } catch {
    return resolved === PGPASS_PATH;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event, ctx) => {
    if (
      (isToolCallEventType("read", event) ||
        isToolCallEventType("write", event) ||
        isToolCallEventType("edit", event)) &&
      isPgpassPath(event.input.path, ctx.cwd)
    ) {
      return { block: true, reason: "~/.pgpass is reserved for the trusted pgsql tool" };
    }
  });

  sandbox(pi);
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

  // These run after pi-sandbox's handlers because sandbox(pi) registered first.
  pi.on("tool_call", clearBlock);
  pi.on("tool_execution_update", clearBlock);
  pi.on("tool_execution_end", clearBlock);
}
