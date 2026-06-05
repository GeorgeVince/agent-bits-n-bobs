---
name: summarize
description: Fetch a URL or convert a local file (PDF, DOCX, PPTX, XLSX, HTML, etc.) into Markdown using `uvx markitdown`, so it can be read, quoted, or summarized. Use when asked to read, extract from, or summarize a web page or document — especially PDFs and other binary formats the normal read tool cannot open.
---

# summarize

Turn URLs and binary documents (PDF / DOCX / PPTX / XLSX / HTML / …) into **Markdown** so
they can be inspected with the `read` tool, quoted, or summarized.

`markitdown` fetches URLs itself and auto-detects the format; this skill wraps it to save
the output to a temp file (so large documents never flood the context) and to optionally
produce a quick summary.

## Requirements

- `uvx` (from [uv](https://docs.astral.sh/uv/)) and `node`. No install step is needed —
  `uvx` fetches `markitdown` automatically on first run.

## Usage

Run from this skill directory:

```bash
# Convert a URL or file -> writes a temp .md, prints its path + a short preview
node to-markdown.mjs <url-or-path>

# Print the full Markdown straight to stdout (good for small pages / piping)
node to-markdown.mjs <url-or-path> --stdout

# Write Markdown to a specific file
node to-markdown.mjs <url-or-path> --out /tmp/doc.md

# Convert + summarize with a fast model (pass focus/audience for best results)
node to-markdown.mjs <url-or-path> --summary --prompt "Focus on security implications and action items"
```

## Recommended flow

1. Run `node to-markdown.mjs <url-or-path>` to get a temp `.md` path.
2. Use the `read` tool on that path (with `offset`/`limit`) to read large documents in
   chunks instead of dumping everything into context at once.
3. Use `--summary` only when a quick overview is sufficient.

## Notes

- PDF support is always enabled (`markitdown[pdf]`) because many document URLs are only
  detected as PDFs after fetching (e.g. arXiv links).
- `--summary` runs `pi --model claude-haiku-4-5 --no-tools --no-session`, truncating very
  large inputs (head + tail) before summarizing.
