/**
 * MCP bridge extension for pi.
 *
 * pi has no built-in MCP support — this extension connects to one or more
 * Model Context Protocol servers, discovers their tools, and registers each
 * one as a native pi tool callable by the LLM.
 *
 * Config discovery (first match wins):
 *   1. $PI_MCP_CONFIG                       (explicit file path)
 *   2. <this extension dir>/mcp.json
 *   3. $PI_CODING_AGENT_DIR/mcp.json        (default ~/.pi/agent/mcp.json)
 *   4. <cwd>/.pi/mcp.json                   (project-local)
 *
 * Config format (Claude-Desktop compatible "mcpServers" map):
 * {
 *   "mcpServers": {
 *     "filesystem": {
 *       "command": "npx",
 *       "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
 *       "env": { "FOO": "bar" }
 *     },
 *     "remote": {
 *       "url": "https://example.com/mcp",
 *       "type": "http",                       // "http" (default) or "sse"
 *       "headers": { "Authorization": "Bearer ${MY_TOKEN}" }
 *     },
 *     "disabled-one": { "command": "...", "disabled": true }
 *   }
 * }
 *
 * Env references ${VAR} / $VAR inside strings are expanded from process.env.
 *
 * Requires `npm install` in this directory (pulls in @modelcontextprotocol/sdk).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config types & loading
// ---------------------------------------------------------------------------

interface ServerConfig {
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	url?: string;
	type?: "http" | "sse";
	headers?: Record<string, string>;
	disabled?: boolean;
}

interface McpConfig {
	mcpServers?: Record<string, ServerConfig>;
}

function agentDir(): string {
	return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function candidateConfigPaths(cwd: string): string[] {
	const paths: string[] = [];
	if (process.env.PI_MCP_CONFIG) paths.push(process.env.PI_MCP_CONFIG);
	paths.push(join(HERE, "mcp.json"));
	paths.push(join(agentDir(), "mcp.json"));
	paths.push(join(cwd, ".pi", "mcp.json"));
	return paths;
}

function loadConfig(cwd: string): { config: McpConfig; path: string | null } {
	for (const p of candidateConfigPaths(cwd)) {
		if (p && existsSync(p)) {
			try {
				return { config: JSON.parse(readFileSync(p, "utf8")) as McpConfig, path: p };
			} catch (err: any) {
				throw new Error(`Failed to parse MCP config at ${p}: ${err.message}`);
			}
		}
	}
	return { config: {}, path: null };
}

/** Expand ${VAR} and $VAR references from process.env. */
function expandEnv(value: string): string {
	return value
		.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name) => process.env[name] ?? "")
		.replace(/\$([A-Z0-9_]+)/gi, (_, name) => process.env[name] ?? "");
}

function expandRecord(rec: Record<string, string> | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(rec ?? {})) out[k] = expandEnv(v);
	return out;
}

// ---------------------------------------------------------------------------
// Tool name sanitization (pi tool names: lowercase, digits, underscore)
// ---------------------------------------------------------------------------

function sanitize(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

// ---------------------------------------------------------------------------
// MCP content -> pi tool result content
// ---------------------------------------------------------------------------

type PiContent =
	| { type: "text"; text: string }
	| { type: "image"; mimeType: string; data: string };

function mapContent(mcpContent: any[]): PiContent[] {
	const out: PiContent[] = [];
	for (const c of mcpContent ?? []) {
		if (c.type === "text") {
			out.push({ type: "text", text: String(c.text ?? "") });
		} else if (c.type === "image" && c.data) {
			out.push({ type: "image", mimeType: c.mimeType ?? "image/png", data: c.data });
		} else if (c.type === "audio") {
			out.push({ type: "text", text: `[audio content: ${c.mimeType ?? "unknown"} omitted]` });
		} else if (c.type === "resource" && c.resource) {
			if (typeof c.resource.text === "string") {
				out.push({ type: "text", text: c.resource.text });
			} else {
				out.push({ type: "text", text: `[embedded resource: ${c.resource.uri ?? "unknown"}]` });
			}
		} else if (c.type === "resource_link") {
			out.push({ type: "text", text: `[resource link: ${c.uri ?? c.name ?? "unknown"}]` });
		} else {
			out.push({ type: "text", text: JSON.stringify(c) });
		}
	}
	if (out.length === 0) out.push({ type: "text", text: "(no content)" });
	return out;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

interface Connection {
	name: string;
	client: Client;
	toolNames: string[]; // pi tool names registered for this server
	enabled: boolean; // whether this server's tools are exposed to the LLM
}

async function buildTransport(name: string, cfg: ServerConfig) {
	if (cfg.command) {
		return new StdioClientTransport({
			command: cfg.command,
			args: (cfg.args ?? []).map(expandEnv),
			env: { ...getDefaultEnvironment(), ...expandRecord(cfg.env) },
			cwd: cfg.cwd ? expandEnv(cfg.cwd) : undefined,
			stderr: "ignore",
		});
	}
	if (cfg.url) {
		const url = new URL(expandEnv(cfg.url));
		const headers = expandRecord(cfg.headers);
		const requestInit = Object.keys(headers).length ? { headers } : undefined;
		if (cfg.type === "sse") {
			return new SSEClientTransport(url, { requestInit, eventSourceInit: { fetch } });
		}
		return new StreamableHTTPClientTransport(url, { requestInit });
	}
	throw new Error(`Server "${name}" must define either "command" (stdio) or "url" (http/sse).`);
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default async function mcpBridge(pi: ExtensionAPI) {
	const cwd = process.cwd();
	const connections = new Map<string, Connection>();
	const usedNames = new Set<string>();
	// pi tool name -> { connection, originalToolName }
	const toolRouting = new Map<string, { conn: Connection; original: string }>();
	let summary: string[] = [];
	let configPath: string | null = null;

	function uniqueName(base: string): string {
		let candidate = base || "tool";
		let i = 2;
		while (usedNames.has(candidate)) candidate = `${base}_${i++}`;
		usedNames.add(candidate);
		return candidate;
	}

	async function connectServer(name: string, cfg: ServerConfig): Promise<void> {
		const client = new Client({ name: `pi-mcp:${name}`, version: "1.0.0" }, { capabilities: {} });
		const transport = await buildTransport(name, cfg);
		await client.connect(transport);

		const conn: Connection = { name, client, toolNames: [], enabled: true };
		connections.set(name, conn);

		const { tools } = await client.listTools();
		for (const tool of tools) {
			const piName = uniqueName(sanitize(`${name}_${tool.name}`));
			conn.toolNames.push(piName);
			toolRouting.set(piName, { conn, original: tool.name });

			const schema = tool.inputSchema && typeof tool.inputSchema === "object"
				? tool.inputSchema
				: { type: "object", properties: {} };

			pi.registerTool({
				name: piName,
				label: `${name}: ${tool.title ?? tool.name}`,
				description: tool.description ?? `MCP tool "${tool.name}" from server "${name}"`,
				promptSnippet: tool.description?.split("\n")[0] ?? `MCP tool ${tool.name} (${name})`,
				// Pass MCP's JSON Schema straight through to the model.
				parameters: Type.Unsafe(schema),
				async execute(_toolCallId, params, signal) {
					const route = toolRouting.get(piName)!;
					const result: any = await route.conn.client.callTool(
						{ name: route.original, arguments: (params ?? {}) as Record<string, unknown> },
						undefined,
						{ signal },
					);
					const content = mapContent(result.content);
					if (result.isError) {
						const text = content
							.filter((c): c is { type: "text"; text: string } => c.type === "text")
							.map((c) => c.text)
							.join("\n");
						throw new Error(text || `MCP tool "${tool.name}" reported an error.`);
					}
					return { content, details: { server: name, tool: tool.name, structuredContent: result.structuredContent } };
				},
			});
		}

		summary.push(`${name}: ${tools.length} tool${tools.length === 1 ? "" : "s"}`);
	}

	// --- Connect all configured servers during startup -----------------------
	try {
		const loaded = loadConfig(cwd);
		configPath = loaded.path;
		const servers = loaded.config.mcpServers ?? {};
		const entries = Object.entries(servers).filter(([, c]) => !c.disabled);

		await Promise.all(
			entries.map(async ([name, cfg]) => {
				try {
					await connectServer(name, cfg);
				} catch (err: any) {
					summary.push(`${name}: FAILED (${err.message})`);
				}
			}),
		);
	} catch (err: any) {
		summary.push(`config error: ${err.message}`);
	}

	// --- Report status once the session UI is ready ---------------------------
	pi.on("session_start", (_event, ctx) => {
		if (!configPath && summary.length === 0) {
			ctx.ui.notify(
				"MCP: no mcp.json found. Create one (e.g. ~/.pi/agent/mcp.json) and /reload.",
				"info",
			);
			return;
		}
		const ok = connections.size > 0;
		ctx.ui.notify(
			`MCP ${ok ? "connected" : "loaded"}: ${summary.join("  |  ") || "no servers"}`,
			ok ? "info" : "warning",
		);
	});

	// --- Runtime enable/disable: toggle a server's tools via active-tools set --
	// Keeps the connection warm; just shows/hides its tools from the LLM.
	function setServerEnabled(name: string, enabled: boolean): boolean {
		const conn = connections.get(name);
		if (!conn) return false;
		conn.enabled = enabled;
		const owned = new Set(conn.toolNames);
		const active = new Set(pi.getActiveTools());
		if (enabled) for (const t of owned) active.add(t);
		else for (const t of owned) active.delete(t);
		pi.setActiveTools([...active]);
		return true;
	}

	// --- /mcp command ---------------------------------------------------------
	pi.registerCommand("mcp", {
		description: "Manage MCP servers: /mcp [list|tools], /mcp enable|disable|toggle <server>",
		getArgumentCompletions: (prefix) => {
			const parts = prefix.split(/\s+/);
			if (parts.length <= 1) {
				const subs = ["list", "tools", "enable", "disable", "toggle"];
				return subs.filter((s) => s.startsWith(parts[0] ?? "")).map((s) => ({ value: s, label: s }));
			}
			if (["enable", "disable", "toggle"].includes(parts[0])) {
				const p = parts[1] ?? "";
				return [...connections.keys()]
					.filter((n) => n.startsWith(p))
					.map((n) => ({ value: `${parts[0]} ${n}`, label: n }));
			}
			return null;
		},
		handler: async (args, ctx) => {
			const [sub, ...rest] = args.trim().split(/\s+/);
			const cmd = (sub ?? "").toLowerCase();
			const target = rest.join(" ").trim();

			if (connections.size === 0) {
				ctx.ui.notify(
					configPath
						? `No MCP servers connected. Config: ${configPath}`
						: "No MCP config found. See extensions/mcp/mcp.example.json.",
					"warning",
				);
				return;
			}

			// enable / disable / toggle <server>
			if (cmd === "enable" || cmd === "disable" || cmd === "toggle") {
				const conn = connections.get(target);
				if (!conn) {
					ctx.ui.notify(`Unknown server "${target}". Servers: ${[...connections.keys()].join(", ")}`, "warning");
					return;
				}
				const enable = cmd === "toggle" ? !conn.enabled : cmd === "enable";
				setServerEnabled(target, enable);
				ctx.ui.notify(
					`MCP server "${target}" ${enable ? "enabled" : "disabled"} (${conn.toolNames.length} tools ${enable ? "available" : "hidden"}).`,
					"info",
				);
				return;
			}

			// list / tools (default)
			const showTools = cmd === "tools";
			const lines: string[] = [`MCP config: ${configPath}`];
			for (const conn of connections.values()) {
				const state = conn.enabled ? "on " : "off";
				lines.push(`\n[${state}] ${conn.name} (${conn.toolNames.length} tools)`);
				if (showTools) {
					for (const tn of conn.toolNames) {
						lines.push(`   - ${tn}  →  ${toolRouting.get(tn)!.original}`);
					}
				}
			}
			lines.push(
				showTools
					? "\nToggle: /mcp disable <server> · /mcp enable <server>"
					: "\n/mcp tools · /mcp enable|disable|toggle <server>",
			);
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// --- Clean up child processes / sockets on shutdown -----------------------
	pi.on("session_shutdown", async () => {
		await Promise.all(
			[...connections.values()].map((c) => c.client.close().catch(() => {})),
		);
		connections.clear();
	});
}
