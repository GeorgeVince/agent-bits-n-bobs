# agent-bits-n-bobs

Personal [pi](https://github.com/nicholasgasior/pi-coding-agent) configuration — agents, prompts, extensions, and keybindings.

## Setup

```bash
git clone <repo-url>
cd agent-bits-n-bobs
./setup.sh
```

This symlinks everything in `pi/` into `~/.pi/agent/`. Works with both bash and zsh.

## Structure

```
pi/
├── agents/          # Custom subagents (planner, reviewer, scout, worker)
├── extensions/      # Pi extensions (e.g. /exit command)
├── prompts/         # Prompt templates
└── keybindings.json # Key bindings
```
