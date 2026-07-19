#!/usr/bin/env node
// Capture a DURABLE, COMMITTED browser screenshot for the DoD evidence trail.
//
// WHY THIS EXISTS: CLAUDE.md requires "a screenshot is not optional" for any UI change, but
// every browser-DoD claim before 2026-07-19 was session-only — an agent looked at an image in
// its own transcript and asserted "verified". Nothing survived in the repo, so no claim was
// checkable afterwards. This writes an artifact anyone can open and re-generate.
//
// WHY CDP AND NOT `chrome --screenshot`: headless Chrome CLAMPS its window to ~500px wide, so
// `--window-size=390,844` silently renders a 500px layout and CROPS it to 390 — a mobile
// screenshot that LOOKS like horizontal overflow but is a capture artifact. Verified on Chrome
// 150: `--window-size=390` reports innerWidth 500, and --force-device-scale-factor does not
// change the CSS viewport. Emulation.setDeviceMetricsOverride is the only way to get a true
// 390 CSS-px viewport, so we drive the DevTools Protocol directly.
//
// ZERO DEPENDENCIES: uses the system Chrome plus Node 22's global WebSocket. No
// puppeteer/playwright devDependency and no ~100MB browser download.
//
// USAGE:
//   node scripts/capture-evidence.mjs <phase> <label> <width> <height> <url> [--mobile] [--settle=ms]
// Output: docs/evidence/<phase>/<label>-<width>x<height>.png
// Exit 0 = a non-empty PNG whose viewport was ASSERTED to equal the requested width.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const [phase, label, wArg, hArg, url, ...rest] = process.argv.slice(2);
if (!phase || !label || !wArg || !hArg || !url) {
  console.error('usage: capture-evidence.mjs <phase> <label> <width> <height> <url> [--mobile] [--settle=ms]');
  process.exit(1);
}
const width = Number(wArg);
const height = Number(hArg);
const mobile = rest.includes('--mobile');
const settle = Number(rest.find((a) => a.startsWith('--settle='))?.split('=')[1] ?? 6000);
// Pin the color scheme. Headless Chrome's default is DARK, so an unpinned capture silently
// depends on a browser default — the artifact would not be reproducible. Default to light
// (what most users see); pass --scheme=dark to evidence the dark theme deliberately.
const scheme = rest.find((a) => a.startsWith('--scheme='))?.split('=')[1] ?? 'light';
const port = 9222 + Math.floor(Number(process.pid) % 500);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  'about:blank',
], { stdio: 'ignore' });

let ws;
let failure = 'unknown';
try {
  // wait for the CDP endpoint
  let target;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
      if (r.ok) { target = await r.json(); break; }
    } catch { /* not up yet */ }
    await sleep(250);
  }
  if (!target) throw new Error(`CDP did not come up on port ${port}`);

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) =>
    new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

  await send('Page.enable');
  // THE point of using CDP: a real viewport, not a clamped window.
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: mobile ? 2 : 1, mobile,
  });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await send('Page.navigate', { url });
  await sleep(settle);

  // ASSERT the viewport is what we asked for — otherwise the artifact misrepresents the layout
  // and is worse than no artifact at all. This is the check that could fail.
  const probe = await send('Runtime.evaluate', { expression: 'window.innerWidth', returnByValue: true });
  const actual = probe?.result?.result?.value;
  if (actual !== width) throw new Error(`viewport assertion failed: asked ${width}, got ${actual}`);

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const b64 = shot?.result?.data;
  if (!b64) throw new Error('no screenshot data returned');

  const outDir = join(ROOT, 'docs', 'evidence', phase);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${label}-${width}x${height}.png`);
  writeFileSync(out, Buffer.from(b64, 'base64'));
  const bytes = statSync(out).size;
  if (bytes < 1000) throw new Error(`screenshot suspiciously small (${bytes} bytes)`);
  console.log(`✓ ${label}  ${width}x${height}${mobile ? ' (mobile)' : ''}  innerWidth=${actual}  ${bytes} bytes  -> docs/evidence/${phase}/${label}-${width}x${height}.png`);
  failure = null;
} catch (e) {
  failure = e.message;
} finally {
  try { ws?.close(); } catch {}
  try { await fetch(`http://127.0.0.1:${port}/json/close`); } catch {}
  chrome.kill('SIGKILL');
}
if (failure) { console.error(`✗ ${label}: ${failure}`); process.exit(1); }
