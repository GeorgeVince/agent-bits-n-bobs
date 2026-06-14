---
name: visualise
description: "Render inline interactive visuals — SVG diagrams, HTML widgets, charts, and explainers — directly in the conversation. Use this skill whenever the user asks to visualize, diagram, chart, illustrate, or explain something visually, or when an explanation would genuinely benefit from a spatial/interactive diagram rather than text. Also triggers for: flowcharts, architecture diagrams, data visualizations, interactive explainers, comparison layouts, UI mockups, and any request containing 'show me', 'draw', 'map out', 'visualize', or 'diagram'. Even when the user doesn't explicitly ask for a visual, use this skill proactively when the topic has spatial, sequential, or systemic relationships that a diagram would clarify better than prose."
---

# Inline Visualizer

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

| User says | Type | What to build |
|-----------|------|---------------|
| "how does X work" | Illustrative diagram | Spatial metaphor showing the mechanism |
| "what are the components of X" | Structural diagram | Labelled boxes showing containment |
| "walk me through the steps" | Flowchart | Sequential boxes and arrows |
| "compare X vs Y" | Comparison layout | Side-by-side cards with metrics |
| "show me the data" | Chart | Chart.js or inline data viz |
| "explain X" (spatial concept) | Interactive explainer | Sliders, controls, live state |

Default to illustrative for "how does X work" — it's the more ambitious choice. Don't retreat to a flowchart because it feels safer.

## Multiple visuals per response

Generate multiple visuals in a single response, interleaved with prose:

1. Text block (introduce/explain)
2. Visual
3. Text block (transition)
4. Visual (if needed)

Never stack visuals back-to-back without text between them.

## Local HTML output for pi

Default workflow in pi:

1. Create a fragment file under `.pi/visuals/`, for example `.pi/visuals/system-map.fragment.html`.
2. Put only the SVG or HTML fragment in that file.
3. Run the wrapper from the skill directory:

```bash
node render-visual.mjs /path/to/project/.pi/visuals/system-map.fragment.html --title "System map" --open
```

The script writes a standalone `.html` file, prints its absolute path, and opens it in the default browser when `--open` is passed.

Options:

```bash
node render-visual.mjs fragment.html --out .pi/visuals/system-map.html --title "System map"
node render-visual.mjs - --title "Quick visual" --stdout < fragment.html
```

Only use a `visualizer` code fence if the user specifically wants raw output for a client that supports that fence. Otherwise, produce/open a local HTML file and tell the user the path.

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

- Text must stay inside its owning box. If a label is too long, shorten it or split it into multiple lines inside the box.
- Connector labels must not sit on top of arrows, boxes, or other labels. Offset them into clear whitespace.
- Summary/callout boxes must be wide enough for every text line; wrap long sentences explicitly with separate `<text>` elements.
- Container labels should sit inside the container with enough padding, not on borders.
- No arrows through boxes or text. Use L-bends or move nodes when direct connectors collide.
- Recalculate `viewBox` height after the last element and leave at least 30-40px bottom padding.
