import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  if (process.env.HERDR_ENV !== "1") return;

  pi.events.on("request-attention", (data) => {
    const message = typeof data?.message === "string" ? data.message : "Pi needs attention";
    void pi
      .exec(process.env.HERDR_BIN_PATH || "herdr", [
        "notification",
        "show",
        "Pi needs attention",
        "--body",
        message,
        "--sound",
        "request",
      ])
      .catch(() => {});
  });
}
