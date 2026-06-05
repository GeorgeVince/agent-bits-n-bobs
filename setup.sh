#!/usr/bin/env bash
set -euo pipefail

# Registers this repo as a pi package (native add/remove/toggle via pi commands)
# and links the one resource pi packages can't carry: keybindings.json.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

# 1. Install runtime deps (the mcp extension needs @modelcontextprotocol/sdk).
if [ ! -d "$REPO_DIR/node_modules" ]; then
  echo "Installing npm dependencies ..."
  (cd "$REPO_DIR" && npm install)
fi

# 2. Register the repo as a pi package. Idempotent: re-running just updates settings.
echo "Registering pi package ..."
pi install "$REPO_DIR"

# 3. Keybindings are not a pi package resource, so symlink the file directly.
mkdir -p "$PI_DIR"
ln -sfn "$REPO_DIR/pi/keybindings.json" "$PI_DIR/keybindings.json"
echo "Linked keybindings.json -> $PI_DIR/keybindings.json"

cat <<EOF

Done. Manage everything with pi's native commands:
  pi list                 # show installed packages
  pi config               # enable/disable individual extensions, skills, prompts
  pi update               # refresh
  pi remove "$REPO_DIR"   # uninstall

Run pi and type /reload to apply.
EOF
