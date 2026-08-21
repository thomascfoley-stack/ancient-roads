// The committed Daily Light export is platform CONTENT the home office renders
// verbatim — so its shape is an invariant, not a hope. A regenerated file that
// dropped days, lost a half, or leaked raw ingest line breaks would ship a
// broken office with every check green; this pins what "complete" means.
// (morning-evening.json predates this test; daily-light adopts the discipline.)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Entry = { title: string; body: string; attribution: string };
type Data = Record<string, { am?: Entry; pm?: Entry }>;

const data = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'public', 'devotional', 'daily-light.json'), 'utf8'),
) as Data;

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

  it('every entry carries verbatim text, a real title, and its attribution', () => {
    for (const [key, day] of Object.entries(data)) {
      for (const half of ['am', 'pm'] as const) {
        const e = day[half]!;
        expect(e.title, key).toMatch(/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2} — (Morning|Evening)$/);
        expect(e.body.length, `${key} ${half} body too short`).toBeGreaterThan(80);
        expect(e.attribution).toContain('Daily Light');
        // Presentation normalization happened at export: no raw ingest line
        // breaks, no double-hyphen separators left to render as-is.
        expect(e.body, `${key} ${half} carries a raw newline`).not.toMatch(/\n/);
        expect(e.body, `${key} ${half} carries an unconverted -- separator`).not.toMatch(/--/);
      }
    }
  });

  it('the halves agree with the title, so the clock picks the right page', () => {
    expect(data['08-21']!.am!.title).toBe('August 21 — Morning');
    expect(data['08-21']!.pm!.title).toBe('August 21 — Evening');
  });
});
