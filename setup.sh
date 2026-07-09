#!/usr/bin/env bash
set -euo pipefail

# Registers this repo as a pi package (native add/remove/toggle via pi commands)
# and links the one resource pi packages can't carry: keybindings.json.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

# 1. Install/sync runtime deps (mcp extension SDK, pi-sandbox, etc.).
echo "Installing npm dependencies ..."
(cd "$REPO_DIR" && npm install)

# 2. Register the repo as a pi package. Idempotent: re-running just updates settings.
echo "Registering pi package ..."
pi install "$REPO_DIR"

# 3. These files are not pi package resources, so symlink them directly.
mkdir -p "$PI_DIR"
for file in AGENTS.md keybindings.json sandbox.json; do
  ln -sfn "$REPO_DIR/pi/$file" "$PI_DIR/$file"
  echo "Linked $file -> $PI_DIR/$file"
done

cat <<EOF

Done. Manage everything with pi's native commands:
  pi list                 # show installed packages
  pi config               # enable/disable individual extensions, skills, prompts
  pi update               # refresh
  pi remove "$REPO_DIR"   # uninstall

Run pi and type /reload to apply. Use /sandbox to inspect the sandbox config.
EOF
