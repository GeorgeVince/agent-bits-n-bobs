# agent-bits-n-bobs

Personal [pi](https://github.com/earendil-works/pi-mono) configuration, shipped as a
**pi package** — extensions, skills, prompts, and keybindings.

## What's inside

```
pi/
├── extensions/   # exit, last-screenshot, mcp, visual-preview
├── skills/       # summarize, visualise
├── prompts/      # getlogs, getstatus
├── AGENTS.md           # global instructions, symlinked into ~/.pi/agent
├── keybindings.json
└── sandbox.json         # pi-sandbox policy symlinked into ~/.pi/agent
```

The root `package.json` declares these under its `pi` manifest, so pi loads them
through its native package system instead of hand-rolled symlinks.

## Install

```bash
git clone <repo-url>
cd agent-bits-n-bobs
./setup.sh
```

`setup.sh` runs `pnpm --recursive update --latest` (with a five-day package cooldown), registers the repo as a pi package via `pi install`, and symlinks profile-level config that pi packages don't carry directly.

By hand, the equivalent is:

```bash
pnpm --recursive update --latest
pi install "$PWD"          # or: pi install git:github.com/<you>/agent-bits-n-bobs
ln -sfn "$PWD/pi/AGENTS.md" ~/.pi/agent/AGENTS.md
ln -sfn "$PWD/pi/keybindings.json" ~/.pi/agent/keybindings.json
ln -sfn "$PWD/pi/sandbox.json" ~/.pi/agent/sandbox.json
mkdir -p ~/.pi/agent/extensions
ln -sfn "$PWD/pi/extensions/pi-autoresearch.json" ~/.pi/agent/extensions/pi-autoresearch.json
```

Use `pi install "$PWD" -l` to install into a project's `.pi/settings.json` instead of
globally.

## Manage (add / remove / toggle)

```bash
pi list                 # show installed packages
pi config               # TUI to enable/disable individual extensions, skills, prompts
pi update               # refresh
pi remove "$PWD"        # uninstall (use the same source you installed with)
```

## Skills

- `summarize`: converts URLs and documents to Markdown.
- `visualise`: generates SVG/HTML visual fragments, wraps them as standalone local HTML files via `pi/skills/visualise/render-visual.mjs`, and opens them with the host-side `visual_preview` tool so previews still work with `pi-sandbox` enabled.
- `ponytail`: installed from `DietrichGebert/ponytail` via `package.json` and loaded through this package's Pi manifest.
- `pi-autoresearch`: autonomous optimization loops; start one with `/skill:autoresearch-create`.
- Matt Pocock's stable engineering and productivity skills: installed from `mattpocock/skills` via `package.json`. Run `/skill:setup-matt-pocock-skills` once in each repo before using its engineering workflow.

## Sandbox

This config includes [`pi-sandbox`](https://github.com/carderne/pi-sandbox) via `pi/extensions/sandbox.ts` and ships a conservative default policy in `pi/sandbox.json`.

- Sandbox is enabled by default.
- Current project and `/tmp` reads/writes are allowed.
- Package-manager/cache paths needed by common tools are allowed.
- Secrets (`.env*`, `*.pem`, `*.key`, common SSH private key names) are hard-blocked for writes.
- Unknown network domains prompt for approval.

Use `/sandbox` inside pi to inspect the effective policy, or launch with `pi --no-sandbox` to disable for a session.

Generated visual previews should be opened with the `visual_preview` tool or `/visual-preview` command, not shell `open`, because bash runs inside the OS sandbox.

## MCP extension

`pi/extensions/mcp` bridges Model Context Protocol servers into pi tools. Copy
`pi/extensions/mcp/mcp.example.json` to `mcp.json` (gitignored) and add your servers.
See `pi/extensions/mcp/README.md` for details.
