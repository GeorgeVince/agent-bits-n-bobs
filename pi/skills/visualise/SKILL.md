---
name: visualise
description: "Render diagrams, charts, and other visual output. Use only when the user explicitly asks for a diagram, chart, visualization, illustration, UI mockup, or other graphical output. Do not use for ordinary requests to explain, compare, show, map out, or walk through something unless the user specifically requests a visual format."
---

# Inline Visualizer

## Invocation gate

Use this skill only when the user explicitly requests graphical or visual output. Prefer a normal text response when they merely ask to explain, compare, show, map out, or walk through something. If the requested format is ambiguous, respond in text; do not ask whether they want a diagram.

Render rich visual content — SVG diagrams, HTML interactive widgets, charts — directly inline in a chat conversation. Output streams token-by-token into a sandboxed iframe. The result feels like a natural extension of the conversation, not an attachment.

## How it works

You generate raw HTML or SVG fragments. In this pi setup, render them as standalone local HTML/CSS files instead of relying on an inline TUI renderer. Generate content fragments first, then wrap them with `render-visual.mjs` (resolved relative to this `SKILL.md`) so the output can be opened in a browser.

Do not output `<html>`, `<head>`, or `<body>` in the fragment unless the user explicitly asks for a complete standalone document.

**Two fragment modes:**

- **SVG mode**: Output starts with `<svg>`. The wrapper auto-wraps it in a card. Best for static diagrams.
- **HTML mode**: Raw HTML fragment. Best for interactive content (sliders, tabs, charts, controls). You can embed `<svg>` elements inside HTML mode.

The local wrapper handles either mode and injects the design-system CSS variables and SVG helper classes.

## Before generating any visual

Read the design system reference before your first visual in a conversation:

1. **Always read first**: `references/design-system.md` — CSS variables, color ramps, typography, core rules
2. **Then read the relevant module**:
   - Diagrams (flowcharts, structural, illustrative): `references/diagrams.md`
   - Interactive explainers, comparisons, data records: `references/components.md`
   - Charts (Chart.js, data viz): `references/charts.md`

Read the design system file once per conversation. Read module files as needed for each visual type.

## Fragment constraints

The fragment is wrapped into a standalone browser document. Keep fragments portable:

1. Put a small `<style>` first if custom CSS is needed (inline styles are fine).
2. Put visible HTML/SVG content next.
3. Put `<script>` last so DOM elements exist before code runs.

Rules:
- Prefer flat fills; avoid gradients, drop shadows, blur, and glow.
- Avoid unnecessary hidden content, comments, or large boilerplate.
- Inline `style="..."` is fine for one-off SVG/HTML details.
- No DOCTYPE, `<html>`, `<head>`, or `<body>` in fragments.
- Use in-memory state for interactive widgets.
- Avoid external fetches. If a library is needed, use CDN sources from `cdnjs.cloudflare.com`, `esm.sh`, `cdn.jsdelivr.net`, or `unpkg.com`.

## The sendPrompt shim

The local HTML wrapper defines `sendPrompt(text)` as a browser shim that logs and alerts the follow-up prompt. It cannot send messages back into pi automatically. Use it only as a cue for a next question; handle filtering, sorting, toggling, and calculations in local JS instead.

## Choosing the right visual type

Route on the verb, not the noun. The same subject gets different treatment depending on what was asked:

| User explicitly asks for | Type | What to build |
|---------------------------|------|---------------|
| "a diagram of how X works" | Illustrative diagram | Spatial metaphor showing the mechanism |
| "a component diagram of X" | Structural diagram | Labelled boxes showing containment |
| "a flowchart of the steps" | Flowchart | Sequential boxes and arrows |
| "a visual comparison of X vs Y" | Comparison layout | Side-by-side cards with metrics |
| "a chart of the data" | Chart | Chart.js or inline data viz |
| "an interactive visual explanation of X" | Interactive explainer | Sliders, controls, live state |

Choose the least elaborate visual type that satisfies the explicit request.

## Multiple visuals per response

Generate multiple visuals in a single response, interleaved with prose:

1. Text block (introduce/explain)
2. Visual
3. Text block (transition)
4. Visual (if needed)

Never stack visuals back-to-back without text between them.

## Local HTML output for pi

Default behavior for any diagram/visual request in pi:

1. Create a fragment file under `.pi/visuals/`, for example `.pi/visuals/system-map.fragment.html`.
2. Put only the SVG or HTML fragment in that file.
3. Validate boxed text before rendering:

```bash
node validate-svg-text.mjs /path/to/project/.pi/visuals/system-map.fragment.html
```

4. Render a local standalone webpage:

```bash
node render-visual.mjs /path/to/project/.pi/visuals/system-map.fragment.html \
  --out /path/to/project/.pi/visuals/system-map.html \
  --title "System map"
```

5. Open the preview with the host-side `visual_preview` tool:

```json
{ "path": ".pi/visuals/system-map.html" }
```

Do this by default. `visual_preview` is intentionally used instead of `render-visual.mjs --open` or bash `open` because it works when `pi-sandbox` is enabled. If the tool is unavailable, tell the user the generated HTML path and only use `--open` when sandboxing is disabled.

Options:

```bash
node render-visual.mjs fragment.html --out .pi/visuals/system-map.html --title "System map"
node render-visual.mjs - --title "Quick visual" --stdout < fragment.html
```

## Notion export

Assume Notion API upload is unavailable. Do not use a Notion API token workflow.

When the user asks to add a diagram to a Notion page:

1. Validate the fragment with `validate-svg-text.mjs`, then render/open the local HTML page as above.
2. Generate a PNG screenshot from the local HTML. Use a viewport wider/taller than the card so the image is not cropped, e.g. Chrome headless with `--window-size=1200,1000` or larger for tall diagrams.
3. Use the Notion MCP `update_page` tool to add content at the section the user specified:
   - a short instruction line: “Click below and press `Cmd+V` to paste the generated PNG.”
   - a blank line where the screenshot should be pasted
   - a `Source code` toggle/dropdown containing the SVG/HTML fragment
4. Capture the screenshot, copy it to the macOS clipboard, and open the Notion page:

```bash
node notion-manual.mjs \
  --html .pi/visuals/system-map.html \
  --image .pi/visuals/system-map.png \
  --page "https://app.notion.com/p/..."
```

The helper uses a large default screenshot viewport (`1200x1000`) to avoid edge cropping. Use `--width` / `--height` for larger diagrams.

The user then clicks the intended insertion point in Notion and presses `Cmd+V`. If the user names a specific Notion section, update that section rather than appending to the end. If the section is ambiguous or cannot be found, ask before editing the page.

## Quick reference

| Rule | Value |
|------|-------|
| SVG viewBox width | Always 680px |
| Font sizes | 14px labels, 12px subtitles only |
| Stroke width | 0.5px for borders and edges |
| Max colors per diagram | 2-3 ramps |
| Box subtitle length | ≤5 words |
| Corner radius (SVG) | rx="4" default, rx="8" for emphasis |
| Corner radius (HTML) | `var(--border-radius-md)` or `-lg` |
| Min font size | 11px |
| Text weights | 400 regular, 500 bold only |
| Heading sizes | h1=22px, h2=18px, h3=16px |

## Layout quality gate

Before rendering or saving any visual, check the geometry manually:

- Text must stay inside its owning box. This is mandatory: before rendering, estimate every boxed line width (`14px ≈ 8px/char`, `12px ≈ 7px/char`) and verify `textWidth <= boxWidth - 2*padding`.
- SVG text does not wrap automatically. If a sentence might exceed the box width, split it into multiple `<text>` lines or shorten it before saving.
- Connector labels must not sit on top of arrows, boxes, or other labels. Offset them into clear whitespace.
- Summary/callout boxes must be wide enough for every text line; wrap long sentences explicitly with separate `<text>` elements.
- Container labels should sit inside the container with enough padding, not on borders.
- No arrows through boxes or text. Use L-bends or move nodes when direct connectors collide.
- Recalculate `viewBox` height after the last element and leave at least 30-40px bottom padding.
