import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BLOCKED_COMMANDS = [/(?:^|[\n;&|])\s*(?:\S*\/)?pi\b[^\n;&|]*\s--no-sandbox(?:\s|$)/m];
const GUARDED_STRINGS = ["nine aws exec -a production", "--role power-access"];

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;
		if (BLOCKED_COMMANDS.some((pattern) => pattern.test(event.input.command))) {
			return { block: true, reason: "Starting pi without its sandbox is blocked" };
		}

		const match = GUARDED_STRINGS.find((string) => event.input.command.includes(string));
		if (!match) return;

		const approved =
			ctx.hasUI &&
			(await ctx.ui.confirm("Approve guarded command?", event.input.command));

		if (!approved) return { block: true, reason: `Command contains "${match}"` };
	});
}
