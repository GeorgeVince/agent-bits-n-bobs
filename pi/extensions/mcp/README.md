# MCP bridge extension

pi has **no built-in MCP** — the core is intentionally small. This extension adds
it: it connects to one or more [Model Context Protocol](https://modelcontextprotocol.io)
servers at startup, discovers their tools, and registers each one as a native pi
tool the LLM can call.

## Setup

1. Install dependencies (once):

   ```bash
   cd extensions/mcp
   npm install
   ```

2. Create an `mcp.json` config. The extension looks in these places (first match wins):

   | Order | Location |
   |-------|----------|
   | 1 | `$PI_MCP_CONFIG` (explicit path) |
   | 2 | `extensions/mcp/mcp.json` (next to this extension) |
   | 3 | `~/.pi/agent/mcp.json` (global) |
   | 4 | `<cwd>/.pi/mcp.json` (project-local) |

   Copy the example to get started:

   ```bash
   cp mcp.example.json mcp.json   # then edit
   ```

3. Start pi (or run `/reload`). You'll see a notification listing connected servers.

## Config format

Claude-Desktop compatible `mcpServers` map. `${VAR}` / `$VAR` are expanded from the environment.

```jsonc
{
  "mcpServers": {
    "filesystem": {                              // stdio server
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "env": { "FOO": "bar" }
    },
    "remote": {                                  // remote server
      "url": "https://example.com/mcp",
      "type": "http",                            // "http" (default) or "sse"
      "headers": { "Authorization": "Bearer ${MY_TOKEN}" }
    },
    "off": { "command": "...", "disabled": true }
  }
}
```

## SigNoz observability server

The [SigNoz MCP server](https://github.com/SigNoz/signoz-mcp-server) exposes your
SigNoz metrics, traces, logs, alerts, dashboards and services as tools (e.g.
`signoz_search_logs`, `signoz_query_metrics`, `signoz_list_services`).

It needs to reach a SigNoz instance with an API key (Settings → API Keys, Admin only):

```bash
export SIGNOZ_URL="https://your-instance.signoz.cloud"   # or self-hosted URL
export SIGNOZ_API_KEY="sk_..."
```

`mcp.example.json` ships three ways to run it; pick one (`signoz` via Docker is the
default and is enabled, the other two are `disabled` alternatives):

| Key | How | Needs |
|-----|-----|-------|
| `signoz` | Docker stdio (`signoz/signoz-mcp-server:latest`) | `docker` |
| `signoz-binary` | Local `signoz-mcp-server` binary in stdio mode | the [binary](https://github.com/SigNoz/signoz-mcp-server/releases) on `PATH` |
| `signoz-self-hosted-http` | Connect to a server you already run in HTTP mode | a reachable `http://host:8000/mcp` |

The Docker image is pulled on first run, which can be slow enough to time out the
initialize handshake — pre-warm it once with `docker pull signoz/signoz-mcp-server:latest`.

**If you have a SigNoz API key, use the Docker `signoz` entry above — it's the
simplest path.** It talks straight to your instance (`SIGNOZ_URL`), so the
region of any hosted endpoint is irrelevant. See the
[Environment Variables](https://github.com/SigNoz/signoz-mcp-server#environment-variables)
docs for `LOG_LEVEL`, `SIGNOZ_CUSTOM_HEADERS`, etc.

> **The hosted SigNoz Cloud endpoint (`https://mcp.<region>.signoz.cloud/mcp`) is
> not supported here.** It requires an interactive OAuth browser flow that this
> bridge doesn't implement. Run the self-hosted server (Docker/binary) pointed at
> your SigNoz instance with an API key instead — which works for SigNoz Cloud
> instances too, just with the key rather than a browser login.

## Linear

Linear hosts a [remote MCP server](https://linear.app/docs/mcp) at
`https://mcp.linear.app/mcp` (Streamable HTTP, OAuth 2.1) with tools for
finding, creating and updating issues, projects and comments. Two ways to
connect; `mcp.example.json` ships both:

| Key | How | Needs |
|-----|-----|-------|
| `linear` | stdio via [`mcp-remote`](https://github.com/geelen/mcp-remote), which handles the OAuth browser flow | one-time browser login |
| `linear-api-key` | direct HTTP with `Authorization: Bearer` | `LINEAR_API_KEY` ([Security & Access](https://linear.app/settings/account/security) → API keys) |

**OAuth (`linear`, default):** the first connection opens a browser to authorize;
tokens are cached in `~/.mcp-auth` so later startups are silent. To avoid the
browser flow racing pi's initialize-handshake timeout, pre-authenticate once
from a terminal:

```bash
npx -y mcp-remote https://mcp.linear.app/mcp   # complete login, then Ctrl+C
```

If auth gets wedged ("internal server error"), clear it with `rm -rf ~/.mcp-auth`.

**API key (`linear-api-key`):** no browser, no child process — good for
headless use or a read-only restricted key. Set `LINEAR_API_KEY`, enable this
entry and disable `linear`.

## Usage

- MCP tools are registered as `<server>_<tool>` (sanitized to lowercase/underscore),
  e.g. `filesystem_read_file`. If a tool name already starts with the server name
  the prefix isn't doubled, so the SigNoz server's tools stay `signoz_search_logs`,
  `signoz_query_metrics`, … (not `signoz_signoz_…`).
- `/mcp` — list connected servers.
- `/mcp tools` — list every registered tool and the underlying MCP tool name.
- `/mcp enable|disable|toggle <server>` — show/hide a connected server's tools.

## Notes

- Servers connect in parallel; a failing server is reported but won't block the others.
- First-run `npx` servers may download packages slowly. If a server times out on the
  initialize handshake, pre-warm it once (`npx -y <pkg> ...`) or point `command` at an
  already-installed binary.
- stdio child processes are closed on session shutdown.
