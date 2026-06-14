/**
 * MCP bridge extension for pi.
 *
 * pi has no built-in MCP support — this extension connects to one or more
 * Model Context Protocol servers and exposes their tools as native pi tools.
 *
 * Progressive disclosure:
 * - Only small gateway tools (`mcp_list_servers`, `mcp_list_tools`, and
 *   `mcp_call_tool`) are active by default.
 * - MCP servers stay disconnected and their large native tool schemas stay out
 *   of the model prompt until the user runs `/mcp enable <server>`.
 * - Set `autoEnable: true` on a server in mcp.json if you really want its tools
 *   connected and active at startup.
 *
 * Config discovery (first match wins):
 *   1. $PI_MCP_CONFIG                       (explicit file path)
 *   2. <this extension dir>/mcp.json
 *   3. $PI_CODING_AGENT_DIR/mcp.json        (default ~/.pi/agent/mcp.json)
 *   4. <cwd>/.pi/mcp.json                   (project-local)
 *
 * Config format (Claude-Desktop compatible "mcpServers" map plus optional
 * pi-specific `description` and `autoEnable` fields):
 * {
 *   "mcpServers": {
 *     "filesystem": {
 *       "command": "npx",
 *       "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
 *       "env": { "FOO": "bar" },
 *       "description": "Local filesystem MCP tools",
 *       "autoEnable": false
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
import { dirname, join } from "node:path";
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
	/** pi-specific: human description shown to the LLM and /mcp list. */
	description?: string;
	/** pi-specific: connect and expose this server's tools at startup. Defaults to false. */
	autoEnable?: boolean;
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

function briefDescription(text: string, maxLength = 220): string {
	const firstParagraph = text.split(/\n\s*\n/)[0] ?? text;
	const oneLine = firstParagraph.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
	return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength - 1)}…` : oneLine;
}

function defaultServerDescription(name: string): string {
	switch (sanitize(name)) {
		case "aws_docs":
			return "Official AWS documentation search and page-reading tools.";
		case "signoz":
			return "SigNoz observability tools for live logs, traces, metrics, alerts, and dashboards.";
		case "linear":
			return "Linear workspace tools for issues, projects, comments, docs, users, and diffs.";
		case "notion":
			return "Notion workspace tools for search, pages, databases, comments, users, teams, and meeting notes.";
		default:
			return `MCP server "${name}".`;
	}
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

interface McpToolMeta {
	piName: string;
	original: string;
	description: string;
	inputSchema: any;
}

interface Connection {
	name: string;
	description: string;
	client: Client;
	toolNames: string[]; // pi tool names registered for this server
	tools: McpToolMeta[];
	enabled: boolean; // whether this server's tools are exposed to the LLM
}

// The MCP SDK's getDefaultEnvironment() only forwards a small safelist (HOME,
// PATH, USER, ...). On networks behind a TLS-inspecting proxy (e.g. Netskope,
// Zscaler) the CA-bundle / proxy variables would be dropped, so the spawned
// server can't validate TLS and dies with "UnknownIssuer". Forward the common
// network/TLS variables from the parent process so corporate proxies work.
const NETWORK_ENV_KEYS = [
	"HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
	"http_proxy", "https_proxy", "all_proxy", "no_proxy",
	"SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE",
	"AWS_CA_BUNDLE", "NODE_EXTRA_CA_CERTS", "PIP_CERT",
	"UV_SYSTEM_CERTS", "UV_NATIVE_TLS", "UV_INSECURE_HOST",
	"LANG", "LC_ALL",
];

function networkEnv(): Record<string, string> {
	const out: Record<string, string> = {};
	for (const k of NETWORK_ENV_KEYS) {
		const v = process.env[k];
		if (v !== undefined) out[k] = v;
	}
	return out;
}

async function buildTransport(name: string, cfg: ServerConfig) {
	if (cfg.command) {
		return new StdioClientTransport({
			command: cfg.command,
			args: (cfg.args ?? []).map(expandEnv),
			// proxy/CA passthrough < SDK safelist < explicit per-server env
			env: { ...networkEnv(), ...getDefaultEnvironment(), ...expandRecord(cfg.env) },
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
	const serverConfigs = new Map<string, ServerConfig>();
	const connections = new Map<string, Connection>();
	const connectionPromises = new Map<string, Promise<Connection>>();
	const failures = new Map<string, string>();
	const usedNames = new Set<string>(["mcp_list_servers", "mcp_list_tools", "mcp_call_tool"]);
	// pi tool name -> { connection, originalToolName }
	const toolRouting = new Map<string, { conn: Connection; original: string }>();
	let configPath: string | null = null;
	let configError: string | null = null;

	function uniqueName(base: string): string {
		let candidate = base || "tool";
		let i = 2;
		while (usedNames.has(candidate)) candidate = `${base}_${i++}`;
		usedNames.add(candidate);
		return candidate;
	}

	function serverDescription(name: string, cfg: ServerConfig): string {
		return cfg.description?.trim() || defaultServerDescription(name);
	}

	function configuredServerList(): string {
		const names = [...serverConfigs.keys()];
		return names.length ? names.join(", ") : "none";
	}

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

	async function connectServer(name: string, cfg: ServerConfig, exposeTools: boolean): Promise<Connection> {
		const existing = connections.get(name);
		if (existing) {
			if (exposeTools) setServerEnabled(name, true);
			return existing;
		}

		const inFlight = connectionPromises.get(name);
		if (inFlight) {
			const conn = await inFlight;
			if (exposeTools) setServerEnabled(name, true);
			return conn;
		}

		const promise = (async () => {
			failures.delete(name);
			const client = new Client({ name: `pi-mcp:${name}`, version: "1.0.0" }, { capabilities: {} });
			const transport = await buildTransport(name, cfg);
			await client.connect(transport);

			const conn: Connection = {
				name,
				description: serverDescription(name, cfg),
				client,
				toolNames: [],
				tools: [],
				enabled: true,
			};
			connections.set(name, conn);

			const serverPrefix = sanitize(name);
			const { tools } = await client.listTools();
			for (const tool of tools) {
				// Namespace pi tool names with the server name, but don't double up when
				// the server already namespaces its own tools (e.g. SigNoz exposes
				// "signoz_search_logs" — keep that rather than "signoz_signoz_search_logs",
				// which also matches the names referenced in the tools' own descriptions).
				const toolName = sanitize(tool.name);
				const base = toolName === serverPrefix || toolName.startsWith(`${serverPrefix}_`)
					? toolName
					: `${serverPrefix}_${toolName}`;
				const piName = uniqueName(base);
				conn.toolNames.push(piName);
				toolRouting.set(piName, { conn, original: tool.name });

				const schema = tool.inputSchema && typeof tool.inputSchema === "object"
					? tool.inputSchema
					: { type: "object", properties: {} };
				conn.tools.push({
					piName,
					original: tool.name,
					description: tool.description ?? `MCP tool "${tool.name}" from server "${name}"`,
					inputSchema: schema,
				});

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

			// New tools are active immediately after registration. Hide them unless
			// this connection was explicitly requested as enabled.
			setServerEnabled(name, exposeTools);
			return conn;
		})().catch((err: any) => {
			failures.set(name, err?.message ?? String(err));
			throw err;
		}).finally(() => {
			connectionPromises.delete(name);
		});

		connectionPromises.set(name, promise);
		return promise;
	}

	function serverStatusLine(name: string): string {
		const cfg = serverConfigs.get(name)!;
		const conn = connections.get(name);
		const failure = failures.get(name);
		const inFlight = connectionPromises.has(name);
		const state = inFlight
			? "connecting"
			: conn
				? (conn.enabled ? "on" : "off")
				: failure
					? "failed"
					: "lazy/off";
		const toolCount = conn ? `, ${conn.toolNames.length} tools` : "";
		const failureText = failure ? `, error: ${failure}` : "";
		return `[${state}] ${name}${toolCount} — ${serverDescription(name, cfg)}${failureText}`;
	}

	function mcpListText(showTools = false): string {
		const lines: string[] = [`MCP config: ${configPath ?? "(none)"}`];
		if (configError) lines.push(`Config error: ${configError}`);
		if (serverConfigs.size === 0) {
			lines.push("No enabled MCP servers configured.");
			return lines.join("\n");
		}
		for (const name of serverConfigs.keys()) {
			lines.push(`\n${serverStatusLine(name)}`);
			const conn = connections.get(name);
			if (showTools && conn) {
				for (const tn of conn.toolNames) {
					lines.push(`   - ${tn}  →  ${toolRouting.get(tn)!.original}`);
				}
			} else if (showTools) {
				lines.push("   (tools are not loaded yet; enable this server first)");
			}
		}
		return lines.join("\n");
	}

	// --- Load config ----------------------------------------------------------
	try {
		const loaded = loadConfig(cwd);
		configPath = loaded.path;
		const servers = loaded.config.mcpServers ?? {};
		for (const [name, cfg] of Object.entries(servers)) {
			if (!cfg.disabled) serverConfigs.set(name, cfg);
		}
	} catch (err: any) {
		configError = err?.message ?? String(err);
	}

	// --- Small always-on progressive disclosure gateway tools ----------------
	pi.registerTool({
		name: "mcp_list_servers",
		label: "MCP List Servers",
		description: `List configured MCP servers and what each is for. Available servers: ${configuredServerList()}.`,
		promptSnippet: `List available MCP servers (${configuredServerList()})`,
		promptGuidelines: [
			"Use mcp_list_servers, then mcp_list_tools and mcp_call_tool, for one-off MCP access without enabling all native MCP tool schemas.",
		],
		parameters: Type.Object({}),
		async execute() {
			return { content: [{ type: "text" as const, text: mcpListText(false) }], details: { servers: [...serverConfigs.keys()] } };
		},
	});

	pi.registerTool({
		name: "mcp_list_tools",
		label: "MCP List Tools",
		description:
			`Connect to one MCP server lazily and list its tools. Available servers: ${configuredServerList()}. ` +
			"First call without tool to see names/descriptions, then call with tool to fetch that tool's input schema before mcp_call_tool.",
		promptSnippet: "List tools for one MCP server on demand; fetch one schema when needed",
		parameters: Type.Object({
			server: Type.String({ description: `Server name. Available: ${configuredServerList()}` }),
			tool: Type.Optional(Type.String({ description: "Optional original MCP tool name. If provided, returns the full input schema for only this tool." })),
			includeSchemas: Type.Optional(Type.Boolean({ description: "If true, include schemas for all tools. Avoid this for large servers unless necessary." })),
		}),
		async execute(_toolCallId, params) {
			const server = params.server?.trim();
			if (!server || !serverConfigs.has(server)) {
				throw new Error(`Unknown or missing MCP server "${server ?? ""}". Available: ${configuredServerList()}`);
			}
			const conn = await connectServer(server, serverConfigs.get(server)!, false);
			const requestedTool = params.tool?.trim();
			if (requestedTool) {
				const found = conn.tools.find((tool) => tool.original === requestedTool || tool.piName === requestedTool);
				if (!found) {
					throw new Error(`Unknown MCP tool "${requestedTool}" for server "${server}".`);
				}
				const tool = {
					name: found.original,
					piName: found.piName,
					description: found.description,
					inputSchema: found.inputSchema,
				};
				return {
					content: [{ type: "text" as const, text: `Tool schema for "${server}/${found.original}":\n${JSON.stringify(tool, null, 2)}` }],
					details: { server, tool },
				};
			}
			const tools = conn.tools.map((tool) => ({
				name: tool.original,
				piName: tool.piName,
				description: params.includeSchemas ? tool.description : briefDescription(tool.description),
				...(params.includeSchemas ? { inputSchema: tool.inputSchema } : {}),
			}));
			const hint = params.includeSchemas ? "" : "\n\nCall mcp_list_tools again with { server, tool } to fetch one tool's input schema before mcp_call_tool.";
			return {
				content: [{
					type: "text" as const,
					text: `Tools for MCP server "${server}":\n${JSON.stringify(tools, null, 2)}${hint}`,
				}],
				details: { server, tools },
			};
		},
	});

	pi.registerTool({
		name: "mcp_call_tool",
		label: "MCP Call Tool",
		description:
			"Call a specific MCP tool by original tool name. Use mcp_list_tools first to discover the exact tool name and input schema.",
		promptSnippet: "Call a discovered MCP tool by server and tool name",
		parameters: Type.Object({
			server: Type.String({ description: `Server name. Available: ${configuredServerList()}` }),
			tool: Type.String({ description: "Original MCP tool name from mcp_list_tools, not the pi-prefixed name." }),
			arguments: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Arguments matching the tool's input schema." })),
		}),
		async execute(_toolCallId, params, signal) {
			const server = params.server?.trim();
			if (!server || !serverConfigs.has(server)) {
				throw new Error(`Unknown or missing MCP server "${server ?? ""}". Available: ${configuredServerList()}`);
			}
			const conn = await connectServer(server, serverConfigs.get(server)!, false);
			const tool = params.tool?.trim();
			if (!tool || !conn.tools.some((t) => t.original === tool)) {
				throw new Error(`Unknown or missing MCP tool "${tool ?? ""}" for server "${server}". Call mcp_list_tools first.`);
			}
			const result: any = await conn.client.callTool(
				{ name: tool, arguments: (params.arguments ?? {}) as Record<string, unknown> },
				undefined,
				{ signal },
			);
			const content = mapContent(result.content);
			if (result.isError) {
				const text = content
					.filter((c): c is { type: "text"; text: string } => c.type === "text")
					.map((c) => c.text)
					.join("\n");
				throw new Error(text || `MCP tool "${tool}" reported an error.`);
			}
			return { content, details: { server, tool, structuredContent: result.structuredContent } };
		},
	});

	// --- Auto-enable only servers that explicitly opt in ----------------------
	await Promise.all(
		[...serverConfigs.entries()]
			.filter(([, cfg]) => cfg.autoEnable === true)
			.map(async ([name, cfg]) => {
				try {
					await connectServer(name, cfg, true);
				} catch {
					// failure is recorded in failures and displayed by /mcp list
				}
			}),
	);

	// --- Report status once the session UI is ready ---------------------------
	pi.on("session_start", (_event, ctx) => {
		if (!configPath && !configError && serverConfigs.size === 0) {
			ctx.ui.notify(
				"MCP: no mcp.json found. Create one (e.g. ~/.pi/agent/mcp.json) and /reload.",
				"info",
			);
			return;
		}
		ctx.ui.notify(
			`MCP lazy loaded: ${[...serverConfigs.keys()].join(", ") || "no servers"}. Use /mcp list, /mcp enable <server>, or the MCP gateway tools on demand.`,
			configError ? "warning" : "info",
		);
	});

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
				return [...serverConfigs.keys()]
					.filter((n) => n.startsWith(p))
					.map((n) => ({ value: `${parts[0]} ${n}`, label: n }));
			}
			return null;
		},
		handler: async (args, ctx) => {
			const [sub, ...rest] = args.trim().split(/\s+/);
			const cmd = (sub || "list").toLowerCase();
			const target = rest.join(" ").trim();

			if (serverConfigs.size === 0) {
				ctx.ui.notify(mcpListText(false), configError ? "error" : "warning");
				return;
			}

			// enable / disable / toggle <server>
			if (cmd === "enable" || cmd === "disable" || cmd === "toggle") {
				if (!serverConfigs.has(target)) {
					ctx.ui.notify(`Unknown server "${target}". Servers: ${configuredServerList()}`, "warning");
					return;
				}

				if (cmd === "disable") {
					const changed = setServerEnabled(target, false);
					ctx.ui.notify(changed
						? `MCP server "${target}" disabled (tools hidden).`
						: `MCP server "${target}" is not connected; already hidden.`, "info");
					return;
				}

				const shouldEnable = cmd === "enable" ? true : !(connections.get(target)?.enabled ?? false);
				if (!shouldEnable) {
					setServerEnabled(target, false);
					ctx.ui.notify(`MCP server "${target}" disabled (tools hidden).`, "info");
					return;
				}

				try {
					const conn = await connectServer(target, serverConfigs.get(target)!, true);
					ctx.ui.notify(
						`MCP server "${target}" enabled (${conn.toolNames.length} tools available).`,
						"info",
					);
				} catch (err: any) {
					ctx.ui.notify(`Failed to enable MCP server "${target}": ${err?.message ?? err}`, "error");
				}
				return;
			}

			// list / tools (default)
			ctx.ui.notify(
				mcpListText(cmd === "tools"),
				configError ? "warning" : "info",
			);
		},
	});

	// --- Clean up child processes / sockets on shutdown -----------------------
	pi.on("session_shutdown", async () => {
		await Promise.all(
			[...connections.values()].map((c) => c.client.close().catch(() => {})),
		);
		connections.clear();
		connectionPromises.clear();
	});
}
