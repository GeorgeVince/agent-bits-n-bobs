#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_DIR="$HOME/.pi/agent"

echo "Linking $REPO_DIR/pi → $PI_DIR"
echo ""

# Helper: symlink a file (overwrites existing)
link() {
  local src="$1" dest="$2"
  rm -f "$dest"
  ln -s "$src" "$dest"
  echo "  $(basename "$dest")"
}

# Helper: symlink all files in a source dir matching a pattern into a target dir
link_dir() {
  local label="$1" src_dir="$2" pattern="$3" dest_dir="$4"
  mkdir -p "$dest_dir"
  echo "$label:"
  find "$src_dir" -maxdepth 1 -name "$pattern" -type f | while read -r f; do
    link "$f" "$dest_dir/$(basename "$f")"
  done
}

# Helper: symlink a whole directory (overwrites existing link/dir)
link_subdir() {
  local src="$1" dest="$2"
  rm -rf "$dest"
  ln -s "$src" "$dest"
  echo "  $(basename "$dest")/"
}

# Link repo config
link_dir "Agents"     "$REPO_DIR/pi/agents"     "*.md" "$PI_DIR/agents"
link_dir "Prompts"    "$REPO_DIR/pi/prompts"     "*.md" "$PI_DIR/prompts"
link_dir "Extensions" "$REPO_DIR/pi/extensions"  "*.ts" "$PI_DIR/extensions"

# Skills are directories containing a SKILL.md; link each one whole so its
# references/ and scripts/ travel with it.
if [ -d "$REPO_DIR/pi/skills" ] && find "$REPO_DIR/pi/skills" -mindepth 2 -maxdepth 2 -name SKILL.md -type f | read -r _; then
  echo "Skills:"
  find "$REPO_DIR/pi/skills" -mindepth 2 -maxdepth 2 -name SKILL.md -type f | while read -r skill; do
    dir="$(dirname "$skill")"
    link_subdir "$dir" "$PI_DIR/skills/$(basename "$dir")"
  done
fi

# Directory-style extensions (subdirs with an index.ts) are linked whole, so
# their node_modules and local config (e.g. mcp.json) travel with them.
if find "$REPO_DIR/pi/extensions" -mindepth 2 -maxdepth 2 -name index.ts -type f | read -r _; then
  echo "Extension dirs:"
  find "$REPO_DIR/pi/extensions" -mindepth 2 -maxdepth 2 -name index.ts -type f | while read -r idx; do
    dir="$(dirname "$idx")"
    link_subdir "$dir" "$PI_DIR/extensions/$(basename "$dir")"
  done
fi

echo "Keybindings:"
link "$REPO_DIR/pi/keybindings.json" "$PI_DIR/keybindings.json"

# Subagent (from pi's built-in examples)
PI_PKG="$(dirname "$(which pi)")/../lib/node_modules/@mariozechner/pi-coding-agent"
if [ -d "$PI_PKG/examples/extensions/subagent" ]; then
  link_dir "Subagent" "$PI_PKG/examples/extensions/subagent" "*.ts" "$PI_DIR/extensions/subagent"
else
  echo "⚠ pi package not found, skipping subagent"
fi

echo ""
echo "✅ Done! Run pi and type /reload to apply."
