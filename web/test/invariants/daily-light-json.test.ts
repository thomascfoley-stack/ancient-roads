// The committed Daily Light export is platform CONTENT the home office renders
// verbatim — so its shape is an invariant, not a hope. A regenerated file that
// dropped days, lost a half, fused the citation tail back into the scripture
// paragraph, or leaked raw ingest line breaks would ship a broken office with
// every check green; this pins what "complete" means.
// (morning-evening.json predates this test; daily-light adopts the discipline.)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Entry = { title: string; body: string; refs: string; attribution: string };
type Data = Record<string, { am?: Entry; pm?: Entry }>;

const data = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'public', 'devotional', 'daily-light.json'), 'utf8'),
) as Data;

// The exporter's own citation-line grammar, duplicated here AS THE CHECK: if the
// two drift, either the exporter regressed or this test needs a conscious update.
const BOOK_TOKEN = /^[0-9]?[A-Z][A-Za-z]{0,4}\.?$/; // interior capital: the module prints "EPh 2:1,3" (Feb 18 Evening)
const NUM_TOKEN = /^\d{1,3}(?:[:.]\d{1,3})?(?:[,\-]\d{1,3})*(?::\d{1,3}(?:[,\-]\d{1,3})*)?$/;
const isCitationRun = (s: string) => {
  const tokens = s.trim().split(/\s+/);
  return tokens.length > 0 && tokens.every((t) => BOOK_TOKEN.test(t) || NUM_TOKEN.test(t))
    && tokens.some((t) => /\d[:.]\d/.test(t));
};

describe('daily-light.json — the committed office export', () => {
  it('covers all 366 calendar days with both halves', () => {
    expect(Object.keys(data)).toHaveLength(366);
    expect(data['02-29']).toBeDefined(); // leap day: present in the source, keyed MM-DD not ordinal
    for (const [key, day] of Object.entries(data)) {
      expect(key).toMatch(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
      expect(day.am, `${key} has no morning`).toBeDefined();
      expect(day.pm, `${key} has no evening`).toBeDefined();
    }
  });

  it('every entry: verbatim text, a real title, its citation list SPLIT OUT, and attribution', () => {
    for (const [key, day] of Object.entries(data)) {
      for (const half of ['am', 'pm'] as const) {
        const e = day[half]!;
        expect(e.title, key).toMatch(/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2} — (Morning|Evening)$/);
        expect(e.body.length, `${key} ${half} body too short`).toBeGreaterThan(60);
        expect(e.attribution).toContain('Daily Light');
        // The citation tail lives in `refs` — a real reference run, never empty.
        expect(isCitationRun(e.refs), `${key} ${half} refs is not a citation run: ${e.refs.slice(0, 60)}`).toBe(true);
        // And the BODY no longer ends with one: the fused-citations defect
        // (2026-08-21 audit) rendered "…goodly heritage. Ps 119:57 1Co 3:21,23…"
        // in the scripture typeface. SEED: append e.refs back onto e.body and
        // this goes red.
        const tail = e.body.split(/\s+/).slice(-4).join(' ');
        expect(isCitationRun(tail), `${key} ${half} body still ends in citations: …${tail}`).toBe(false);
      }
    }
  });

  it('pins the two audited entries end-to-end', () => {
    const am = data['08-21']!.am!;
    expect(am.title).toBe('August 21 — Morning');
    expect(am.body.startsWith('[Thou art] my portion, O LORD.')).toBe(true);
    expect(am.refs.startsWith('Ps 119:57')).toBe(true);
    // 03-08 pm was the worst case: nine portions, zero printed separators —
    // the portion boundaries were flattened AT INGEST (raw rows verified
    // 2026-08-21); the refs list is the compiler's own map of what was fused.
    const pm = data['03-08']!.pm!;
    expect(pm.refs).toBe('2Ti 1:12 Eph 3:20 2Co 9:8 Heb 2:18 7:25 Jude 1:24 2Ti 1:12 Php 3:21 Mt 9:28,29');
    expect(pm.body.endsWith('be it unto you.')).toBe(true);
  });
});
