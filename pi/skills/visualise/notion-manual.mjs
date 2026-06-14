#!/usr/bin/env node
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error(`Usage:
  node notion-manual.mjs --html .pi/visuals/diagram.html --page "https://app.notion.com/p/..."
  node notion-manual.mjs --image .pi/visuals/diagram.png --page "https://app.notion.com/p/..."

If --html is provided, captures a PNG screenshot first. Then copies the PNG to the
macOS clipboard and opens the Notion page. In Notion, click the target spot and press Cmd+V.

Options:
  --html <path>        Local rendered HTML page to screenshot
  --image <path>       PNG output path for --html, or existing PNG/JPEG/GIF/WebP to copy
  --page <url>         Optional Notion page URL to open
  --width <px>         Screenshot viewport width (default: 1200)
  --height <px>        Screenshot viewport height (default: 1000)
  --reveal             Also reveal the image in Finder
`);
  process.exit(2);
}

const args = process.argv.slice(2);
const opts = { width: '1200', height: '1000' };
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--html') opts.html = args[++i];
  else if (a === '--image') opts.image = args[++i];
  else if (a === '--page') opts.page = args[++i];
  else if (a === '--width') opts.width = args[++i];
  else if (a === '--height') opts.height = args[++i];
  else if (a === '--reveal') opts.reveal = true;
  else usage();
}
if (!opts.html && !opts.image) usage();

function chromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  const found = spawnSync('bash', ['-lc', 'command -v google-chrome || command -v chromium || command -v chromium-browser'], { encoding: 'utf8' });
  return found.stdout.trim();
}

let image;
if (opts.html) {
  const html = path.resolve(opts.html);
  if (!fs.existsSync(html)) throw new Error(`HTML file not found: ${html}`);
  image = path.resolve(opts.image || html.replace(/\.html?$/i, '.png'));
  fs.mkdirSync(path.dirname(image), { recursive: true });
  const chrome = chromePath();
  if (!chrome) throw new Error('Could not find Chrome/Chromium for screenshot capture.');
  const shot = spawnSync(chrome, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${opts.width},${opts.height}`,
    `--screenshot=${image}`,
    `file://${html}`,
  ], { encoding: 'utf8' });
  if (shot.status !== 0) {
    process.stderr.write(shot.stderr || shot.stdout || 'Failed to capture screenshot\n');
    process.exit(shot.status || 1);
  }
  console.log(`Captured screenshot: ${image}`);
} else {
  image = path.resolve(opts.image);
}

if (!fs.existsSync(image)) throw new Error(`Image not found: ${image}`);
const ext = path.extname(image).toLowerCase();
if (ext !== '.png') {
  console.warn(`Warning: clipboard image copy is best tested with PNG. Got ${ext || 'no extension'}.`);
}

const script = `set the clipboard to (read (POSIX file "${image.replaceAll('"', '\\"')}") as «class PNGf»)`;
const copy = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
if (copy.status !== 0) {
  process.stderr.write(copy.stderr || copy.stdout || 'Failed to copy image to clipboard\n');
  process.exit(copy.status || 1);
}

console.log(`Copied image to clipboard: ${image}`);
console.log('In Notion: click where the image should go, then press Cmd+V.');

if (opts.page) {
  spawn('open', [opts.page], { detached: true, stdio: 'ignore' }).unref();
  console.log(`Opened Notion page: ${opts.page}`);
}
if (opts.reveal) {
  spawn('open', ['-R', image], { detached: true, stdio: 'ignore' }).unref();
  console.log('Revealed image in Finder.');
}
