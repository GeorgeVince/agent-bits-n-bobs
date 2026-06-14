#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
let input = '-';
let out = '';
let title = 'Visual';
let open = false;
let stdout = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--out') out = args[++i] ?? '';
  else if (arg === '--title') title = args[++i] ?? title;
  else if (arg === '--open') open = true;
  else if (arg === '--stdout') stdout = true;
  else input = arg;
}

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

function stripVisualizerFence(s) {
  const match = s.match(/```visualizer\s*\n([\s\S]*?)\n```/);
  return (match ? match[1] : s).trim();
}

function esc(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

const raw = input === '-' ? readStdin() : fs.readFileSync(input, 'utf8');
const fragment = stripVisualizerFence(raw);
const isFullDocument = /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(fragment);

const css = String.raw`
:root {
  --color-text-primary: #1F2937; --color-text-secondary: #6B7280; --color-text-tertiary: #9CA3AF;
  --color-text-info: #2563EB; --color-text-success: #059669; --color-text-warning: #D97706; --color-text-danger: #DC2626;
  --color-background-primary: #FFFFFF; --color-background-secondary: #F9FAFB; --color-background-tertiary: #F3F4F6;
  --color-border-tertiary: rgba(0,0,0,0.15); --color-border-secondary: rgba(0,0,0,0.3); --color-border-primary: rgba(0,0,0,0.4);
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --font-mono: "SF Mono", Menlo, monospace;
  --border-radius-md: 8px; --border-radius-lg: 12px; --border-radius-xl: 16px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-text-primary: #E5E7EB; --color-text-secondary: #9CA3AF; --color-text-tertiary: #6B7280;
    --color-text-info: #60A5FA; --color-text-success: #34D399; --color-text-warning: #FBBF24; --color-text-danger: #F87171;
    --color-background-primary: #1A1A1A; --color-background-secondary: #262626; --color-background-tertiary: #111111;
    --color-border-tertiary: rgba(255,255,255,0.15); --color-border-secondary: rgba(255,255,255,0.3); --color-border-primary: rgba(255,255,255,0.4);
  }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; background: var(--color-background-tertiary); color: var(--color-text-primary); font-family: var(--font-sans); line-height: 1.5; }
.visual-shell { width: min(960px, 100%); margin: 0 auto; }
.visual-card { background: var(--color-background-primary); border: 0.5px solid var(--color-border-tertiary); border-radius: var(--border-radius-xl); padding: 18px; overflow: auto; }
.visual-title { margin: 0 0 12px; color: var(--color-text-secondary); font-size: 13px; font-weight: 500; }
svg { display: block; max-width: 100%; height: auto; }
.t { font: 400 14px var(--font-sans); fill: var(--color-text-primary); }
.ts { font: 400 12px var(--font-sans); fill: var(--color-text-secondary); }
.th { font: 500 14px var(--font-sans); fill: var(--color-text-primary); }
.box { fill: var(--color-background-secondary); stroke: var(--color-border-tertiary); }
.node { cursor: pointer; } .node:hover { opacity: 0.85; }
.arr { stroke: var(--color-border-secondary); stroke-width: 1.5; fill: none; }
.leader { stroke: var(--color-text-tertiary); stroke-width: 0.5; stroke-dasharray: 3 2; fill: none; }
.c-purple > rect, .c-purple > circle, .c-purple > ellipse { fill: #EEEDFE; stroke: #534AB7; } .c-purple > .th { fill: #3C3489; } .c-purple > .ts { fill: #534AB7; }
.c-teal > rect, .c-teal > circle, .c-teal > ellipse { fill: #E1F5EE; stroke: #0F6E56; } .c-teal > .th { fill: #085041; } .c-teal > .ts { fill: #0F6E56; }
.c-coral > rect, .c-coral > circle, .c-coral > ellipse { fill: #FAECE7; stroke: #993C1D; } .c-coral > .th { fill: #712B13; } .c-coral > .ts { fill: #993C1D; }
.c-pink > rect, .c-pink > circle, .c-pink > ellipse { fill: #FBEAF0; stroke: #993556; } .c-pink > .th { fill: #72243E; } .c-pink > .ts { fill: #993556; }
.c-gray > rect, .c-gray > circle, .c-gray > ellipse { fill: #F1EFE8; stroke: #5F5E5A; } .c-gray > .th { fill: #444441; } .c-gray > .ts { fill: #5F5E5A; }
.c-blue > rect, .c-blue > circle, .c-blue > ellipse { fill: #E6F1FB; stroke: #185FA5; } .c-blue > .th { fill: #0C447C; } .c-blue > .ts { fill: #185FA5; }
.c-green > rect, .c-green > circle, .c-green > ellipse { fill: #EAF3DE; stroke: #3B6D11; } .c-green > .th { fill: #27500A; } .c-green > .ts { fill: #3B6D11; }
.c-amber > rect, .c-amber > circle, .c-amber > ellipse { fill: #FAEEDA; stroke: #854F0B; } .c-amber > .th { fill: #633806; } .c-amber > .ts { fill: #854F0B; }
.c-red > rect, .c-red > circle, .c-red > ellipse { fill: #FCEBEB; stroke: #A32D2D; } .c-red > .th { fill: #791F1F; } .c-red > .ts { fill: #A32D2D; }
@media (prefers-color-scheme: dark) {
  .c-purple > rect, .c-purple > circle, .c-purple > ellipse { fill: #3C3489; stroke: #AFA9EC; } .c-purple > .th { fill: #CECBF6; } .c-purple > .ts { fill: #AFA9EC; }
  .c-teal > rect, .c-teal > circle, .c-teal > ellipse { fill: #085041; stroke: #5DCAA5; } .c-teal > .th { fill: #9FE1CB; } .c-teal > .ts { fill: #5DCAA5; }
  .c-coral > rect, .c-coral > circle, .c-coral > ellipse { fill: #712B13; stroke: #F0997B; } .c-coral > .th { fill: #F5C4B3; } .c-coral > .ts { fill: #F0997B; }
  .c-pink > rect, .c-pink > circle, .c-pink > ellipse { fill: #72243E; stroke: #ED93B1; } .c-pink > .th { fill: #F4C0D1; } .c-pink > .ts { fill: #ED93B1; }
  .c-gray > rect, .c-gray > circle, .c-gray > ellipse { fill: #444441; stroke: #B4B2A9; } .c-gray > .th { fill: #D3D1C7; } .c-gray > .ts { fill: #B4B2A9; }
  .c-blue > rect, .c-blue > circle, .c-blue > ellipse { fill: #0C447C; stroke: #85B7EB; } .c-blue > .th { fill: #B5D4F4; } .c-blue > .ts { fill: #85B7EB; }
  .c-green > rect, .c-green > circle, .c-green > ellipse { fill: #27500A; stroke: #97C459; } .c-green > .th { fill: #C0DD97; } .c-green > .ts { fill: #97C459; }
  .c-amber > rect, .c-amber > circle, .c-amber > ellipse { fill: #633806; stroke: #EF9F27; } .c-amber > .th { fill: #FAC775; } .c-amber > .ts { fill: #EF9F27; }
  .c-red > rect, .c-red > circle, .c-red > ellipse { fill: #791F1F; stroke: #F09595; } .c-red > .th { fill: #F7C1C1; } .c-red > .ts { fill: #F09595; }
}
button { background: transparent; border: 0.5px solid var(--color-border-secondary); border-radius: var(--border-radius-md); padding: 6px 14px; font-size: 13px; color: var(--color-text-primary); cursor: pointer; font-family: var(--font-sans); }
button:hover { background: var(--color-background-secondary); }
input[type="range"] { accent-color: var(--color-text-info); }
`;

const html = isFullDocument ? fragment : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
  <main class="visual-shell">
    <section class="visual-card" aria-label="${esc(title)}">
      <p class="visual-title">${esc(title)}</p>
${fragment}
    </section>
  </main>
  <script>
    window.sendPrompt = (text) => {
      console.log('sendPrompt:', text);
      alert('Follow-up prompt from visual:\n\n' + text);
    };
  </script>
</body>
</html>
`;

if (stdout) {
  process.stdout.write(html);
} else {
  if (!out) {
    const dir = path.join(process.cwd(), '.pi', 'visuals');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    out = path.join(dir, `visual-${stamp}.html`);
  } else {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  }
  fs.writeFileSync(out, html, 'utf8');
  console.log(path.resolve(out));
  if (open) {
    const child = spawn('open', [path.resolve(out)], { detached: true, stdio: 'ignore' });
    child.unref();
  }
}
