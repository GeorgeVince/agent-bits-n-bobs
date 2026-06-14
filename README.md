# agent-bits-n-bobs

Personal [pi](https://github.com/earendil-works/pi-mono) configuration, shipped as a
**pi package** — extensions, skills, prompts, and keybindings.

## What's inside

```
pi/
├── extensions/   # exit, last-screenshot, mcp (Model Context Protocol bridge)
├── skills/       # summarize, visualise
├── prompts/      # getlogs, getstatus
└── keybindings.json
```

The root `package.json` declares these under its `pi` manifest, so pi loads them
through its native package system instead of hand-rolled symlinks.

## Install

```bash
git clone <repo-url>
cd agent-bits-n-bobs
./setup.sh
```

`setup.sh` runs `npm install` (for the mcp extension's SDK), registers the repo as a
pi package via `pi install`, and symlinks `keybindings.json` (the one thing that isn't a
package resource).

By hand, the equivalent is:

```bash
npm install
pi install "$PWD"          # or: pi install git:github.com/<you>/agent-bits-n-bobs
ln -sfn "$PWD/pi/keybindings.json" ~/.pi/agent/keybindings.json
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
- `visualise`: generates SVG/HTML visual fragments and wraps them as standalone local HTML files via `pi/skills/visualise/render-visual.mjs`.

## MCP extension

`pi/extensions/mcp` bridges Model Context Protocol servers into pi tools. Copy
`pi/extensions/mcp/mcp.example.json` to `mcp.json` (gitignored) and add your servers.
See `pi/extensions/mcp/README.md` for details.
