// B030 — A CLIPPING OPENS ON THE PARAGRAPH, NOT THE WHOLE CHAPTER.
//
// The QA fleet's complaint: "+ Add to study" on a search hit inserted an entire commentary
// section — thousands of words for a one-paragraph match — so every single use began with
// trimming. The owner's ruling: load the surrounding paragraph and let the reader ADD more
// later; adding occasionally beats subtracting always.
//
// The mechanism deliberately does NOT change what is stored. Migration 111's "trim not edit"
// makes trim_start/trim_end a VIEW over the server's full snapshot, so the row still holds the
// whole section (provenance intact, F3 unchanged) and "show more" is an offset change with no
// refetch. What B030 changes is the offsets the row is BORN with.
//
// This drives the real insertClippingFromSection with the DB mocked, because the risk here is
// the WIRING, not the arithmetic — paragraph-around.test.ts already pins the arithmetic, and a
// perfect pure function nothing calls is the defect class this repo names most (A084: the guard
// deleted from all three call sites, 71 tests still green).
import { afterEach, describe, expect, it, vi } from 'vitest';

type Cap = { text: string; values: unknown[] };
let captured: Cap[] = [];
let insertedQuote = '';

vi.mock('../src/lib/db', () => ({
  runAsUser: async (_userId: string, build: (sql: unknown) => unknown[]) => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      captured.push({ text, values });
      if (/INSERT INTO study_blocks/i.test(text)) {
        return [{ id: 'blk-1', quote: insertedQuote, trim_start: null, trim_end: null }];
      }
      if (/UPDATE study_blocks/i.test(text)) return [{ id: 'blk-1' }];
      return []; // no anchors: an empty study
    };
    return (build(sql as never) as unknown[][]).map((r) => r);
  },
}));

const SECTION = [
  'Chapter 7. Of the covenant of God with man.',
  '',
  'The distance between God and the creature is so great, that although reasonable creatures do owe obedience unto him as their Creator, yet they could never have any fruition of him as their blessedness and reward, but by some voluntary condescension on God’s part.',
  '',
  'The first covenant made with man was a covenant of works, wherein life was promised to Adam.',
].join('\n');

afterEach(() => { captured = []; vi.resetModules(); });

describe('B030 — the clipping is born trimmed to the matched paragraph', () => {
  it('a matchHint inside the section stores a trim VIEW of that paragraph only', async () => {
    // SEED: delete the `if (clip.matchHint && block.quote)` branch in insertClippingFromSection,
    // or drop matchHint from the route's call -> RED here (no UPDATE captured).
    insertedQuote = SECTION;
    const { insertClippingFromSection } = await import('../src/lib/studies');
    const res = await insertClippingFromSection('u1', 's1', {
      sectionId: 42,
      matchHint: 'voluntary condescension',
    });
    expect(res.ok).toBe(true);

    const trim = captured.find((c) => /UPDATE study_blocks/i.test(c.text) && /trim_start/i.test(c.text));
    expect(trim, 'no trim was written — the clipping opens on the whole section').toBeTruthy();
    const [start, end] = trim!.values as [number, number];
    const view = SECTION.slice(start, end);
    expect(view).toContain('voluntary condescension');
    // The POINT: the neighbouring paragraphs are outside the view, and the heading is not the view.
    expect(view).not.toContain('covenant of works');
    expect(view).not.toContain('Chapter 7');
    // ...and the stored bytes are still whole, so "add more" needs no refetch.
    const ins = captured.find((c) => /INSERT INTO study_blocks/i.test(c.text))!;
    expect(res.ok && res.block.quote).toBe(SECTION);
    expect(ins).toBeTruthy();
  });

  it('NO hint stores NO trim — the pre-B030 whole-section view, not a guess', async () => {
    insertedQuote = SECTION;
    const { insertClippingFromSection } = await import('../src/lib/studies');
    const res = await insertClippingFromSection('u1', 's1', { sectionId: 42 });
    expect(res.ok).toBe(true);
    expect(captured.some((c) => /UPDATE study_blocks/i.test(c.text))).toBe(false);
  });

  it('an UNPLACEABLE hint stores NO trim rather than a wrong window', async () => {
    // The dangerous failure is not "no trim" — it is a trim aimed at the wrong paragraph, which
    // silently misquotes an attributed voice. Fails to the whole section, which is always honest.
    insertedQuote = SECTION;
    const { insertClippingFromSection } = await import('../src/lib/studies');
    const res = await insertClippingFromSection('u1', 's1', {
      sectionId: 42,
      matchHint: 'a phrase that appears nowhere in this section at all',
    });
    expect(res.ok).toBe(true);
    expect(captured.some((c) => /UPDATE study_blocks/i.test(c.text))).toBe(false);
  });
});
