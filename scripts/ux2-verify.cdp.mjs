// W-UX2VERIFY harness (throwaway evidence tool, swarm-2026-08-22). Drives the already-running
// headless Chrome (CDP on :9222) at the dev server on :3210 and asserts the UX-2 explainer line
// ("Tap a work to read it, or + to open it beside what is on your desk.") is rendered, VISIBLE
// (non-zero box, within the viewport horizontally), and ABOVE the first work row, at desktop
// (1280) and mobile (390) widths. Exits 1 with a FAIL line when any assertion fails — that exit
// is the check the red-proof seeds against. No new dependencies: Node >=22 global WebSocket.
//
// Usage: node scripts/ux2-verify.cdp.mjs [outDir]
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CDP = 'http://localhost:9222';
const PAGE = 'http://localhost:3210/library/commentaries';
const OUT = process.argv[2] ?? '.';
const TEXT = 'Tap a work to read it, or + to open it beside what is on your desk.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newTab() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' });
      if (res.ok) return await res.json();
    } catch { /* chrome not up yet */ }
    await sleep(500);
  }
  throw new Error('CDP not reachable on :9222');
}

async function main() {
  const tab = await newTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };

  let failures = 0;
  for (const width of [1280, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 500 });
    await send('Page.navigate', { url: PAGE });
    await sleep(4000); // dev-server compile + hydration; generous on purpose
    const m = await evaluate(`(() => {
      const spans = [...document.querySelectorAll('p > span')];
      const el = spans.find((s) => s.textContent.trim() === ${JSON.stringify(TEXT)});
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      const firstRow = document.querySelector('a[href^="/work/"]');
      const rowTop = firstRow ? firstRow.getBoundingClientRect().top : null;
      const style = getComputedStyle(el);
      return {
        found: true,
        top: r.top, bottom: r.bottom, left: r.left, right: r.right,
        height: r.height, lines: r.height / parseFloat(style.lineHeight),
        display: style.display, visibility: style.visibility,
        innerWidth, docScrollWidth: document.documentElement.scrollWidth,
        firstRowTop: rowTop,
      };
    })()`);
    console.log(`[${width}px] measurement:`, JSON.stringify(m));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `ux2-cdp-${width}.png`), Buffer.from(shot.result.data, 'base64'));

    const check = (name, ok) => { console.log(`[${width}px] ${name}: ${ok ? 'PASS' : 'FAIL'}`); if (!ok) failures++; };
    check('explainer present in DOM', m.found === true);
    if (m.found) {
      check('explainer visible (non-zero box, not hidden)', m.height > 0 && m.display !== 'none' && m.visibility !== 'hidden');
      check('explainer fully within viewport width', m.left >= 0 && m.right <= m.innerWidth + 1);
      check('no horizontal page overflow', m.docScrollWidth <= m.innerWidth + 1);
      check('explainer above first work row', m.firstRowTop !== null && m.bottom <= m.firstRowTop + 1);
    }
  }

  await send('Target.closeTarget', {}).catch(() => {});
  ws.close();
  console.log(failures === 0 ? 'UX2-VERIFY: ALL PASS' : `UX2-VERIFY: ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('UX2-VERIFY ERROR:', e.message); process.exit(2); });
