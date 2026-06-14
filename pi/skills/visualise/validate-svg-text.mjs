#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node validate-svg-text.mjs <fragment.svg|fragment.html>');
  process.exit(2);
}

const s = fs.readFileSync(file, 'utf8');

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
function num(v, fallback = 0) {
  const n = Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : fallback;
}
function textWidth(text, cls) {
  const px = /\bts\b/.test(cls || '') ? 7 : 8;
  return text.trim().length * px;
}

const rects = [];
for (const m of s.matchAll(/<rect\b[^>]*>/g)) {
  const a = attrs(m[0]);
  rects.push({
    x: num(a.x), y: num(a.y), w: num(a.width), h: num(a.height), tag: m[0], area: num(a.width) * num(a.height),
  });
}

const failures = [];
for (const m of s.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
  const a = attrs(m[0]);
  const raw = m[2].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const x = num(a.x);
  const y = num(a.y);
  const cls = a.class || '';
  const w = textWidth(raw, cls);
  const anchor = a['text-anchor'] || 'start';
  let left = x;
  let right = x + w;
  if (anchor === 'middle') { left = x - w / 2; right = x + w / 2; }
  if (anchor === 'end') { left = x - w; right = x; }

  const containing = rects
    .filter(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
    .sort((a, b) => a.area - b.area)[0];
  if (!containing) continue;

  const pad = 10;
  if (left < containing.x + pad || right > containing.x + containing.w - pad) {
    failures.push({
      text: raw.trim(),
      estimatedWidth: Math.round(w),
      rect: { x: containing.x, y: containing.y, width: containing.w, height: containing.h },
      textBounds: { left: Math.round(left), right: Math.round(right) },
    });
  }
}

if (failures.length) {
  console.error(`Text bounds failures in ${file}:`);
  for (const f of failures) console.error(JSON.stringify(f));
  process.exit(1);
}
console.log(`Text bounds OK: ${file}`);
