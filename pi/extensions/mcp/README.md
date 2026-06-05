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

## Usage

- MCP tools are registered as `<server>_<tool>` (sanitized to lowercase/underscore),
  e.g. `filesystem_read_file`.
- `/mcp` — list connected servers.
- `/mcp tools` — list every registered tool and the underlying MCP tool name.

## Notes

- Servers connect in parallel; a failing server is reported but won't block the others.
- First-run `npx` servers may download packages slowly. If a server times out on the
  initialize handshake, pre-warm it once (`npx -y <pkg> ...`) or point `command` at an
  already-installed binary.
- stdio child processes are closed on session shutdown.
