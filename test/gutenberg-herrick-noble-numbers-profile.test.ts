// herrick-noble-numbers gutenberg profile (PROFILES['herrick-noble-numbers'] in
// adapter-gutenberg).
//
// PG #22421 (Pollard's 1891 ed. of Herrick's 1648 _Hesperides & Noble Numbers_)
// prints BOTH of Herrick's volumes: the secular Hesperides (numbered 1-1130) and
// the sacred Noble Numbers. The profile scopes the part-title " HIS NOBLE
// NUMBERS:" to the appendix "POEMS / NOT INCLUDED IN _HESPERIDES_." and walks the
// edition's own numbered poems 1-271 as the contents list — the COMPLETE
// sequence, no gaps.
//
// The load-bearing detail: Pollard prints poem 268 ("This crosstree here / Doth
// Jesus bear...") with a BARE-NUMERAL heading "268." and NO descriptive title
// (the only such poem in the volume). An earlier profile declared the strict
// pattern `/^(\d{1,3})\. (.+)$/` (which requires a non-empty title) plus
// `expectMissing: [268]` under the false premise "268 is absent from the book".
// The strict pattern never matched the bare "268." line, so no unit was created
// for 268; the `expectMissing` declaration then made the sequence guard treat
// 268's absence as expected — poem 268 was swallowed into poem 267's body slice
// (which ran all the way to poem 269's heading), invisible to the `filtered`
// report and to section / poem-number retrieval, and FAIL CLOSED never fired.
//
// The fix widens the pattern to `/^(\d{1,3})\.\s*(.*)$/` (admitting an empty
// title), removes the false `expectMissing: [268]`, and folds poem 268's first
// verse line into its display heading (mirroring the _Holy Sonnets._ children
// heading build) so the reader surface is "268. This crosstree here" rather
// than a bare "268.".
//
// The raw PG #22421 text is a .gitignore-d cache write under
// data/raw/gutenberg/22421.txt (fetched on demand by fetchGutenberg), so this
// suite — like gutenberg-luther-works-profile / gutenberg-newman-apologia /
// gutenberg-keble-comma-epigraph — drives the adapter with an in-memory fixture
// shaped like the real text rather than reading the cache. The poem 268 region
// below is VERBATIM from PG #22421 lines 20081-20141 (whitespace preserved);
// the surrounding 270 poems are shape-only filler the profile's 1..271 sequence
// guard requires, so the bug is reproducible in CI without the cache.

import { describe, expect, it } from 'vitest';
import { buildSections, scopedSections, PROFILES, type ScopedSpec } from '../src/ingest/adapter-gutenberg.js';

// Hesperides front matter — outside the Noble Numbers scope. The probe titles
// (the dryrun's secular probes) must be EXCLUDED from the kept set. Numbered
// >271 so a scope-isolation regression would trip the `extra` guard (num >
// last=271) rather than silently dupe a Noble Numbers poem.
const HESPERIDES_FRONT = `
999. THE ARGUMENT OF HIS BOOK.

    Loves greatness is to be measured by desires of the noble heart; a
    secular Hesperides poem that opens the volume and must never serve
    under the sacred Noble Numbers title at all, not ever, in the reader.

998. TO DIANEME.

    Another secular Hesperides poem; its probe title must stay dropped
    by the scoped selection so the sacred scope is not widened by any
    preface or title-page mention of these secular pieces. Stay out.

997. DELIGHT IN DISORDER.

    A sweet disorder in the dress kindles in clothes a wantonness; this
    secular Hesperides probe too must be excluded from the kept set by
    the whole-line Noble Numbers scope-start marker below. Stay out.
`;

// Real (literal head + body) poems for the boundaries and the bug region; the
// remaining ~265 poems are generated as generic shape-only filler so the
// profile's 1..271 sequence guard (which requires every number) passes.
// Poem 268 has head: null — the BARE-NUMERAL heading Pollard actually prints.
const REAL: Record<number, { head: string | null; body: string[] }> = {
  1: {
    head: '1. HIS CONFESSION.',
    body: [
      '    Look how our foul days do exceed our fair;',
      "    E'n so those lines, pen'd by my wanton wit,",
      "    Treble the number of these good I've writ.",
    ],
  },
  267: {
    head: '267. HIS ANTHEM TO CHRIST ON THE CROSS.',
    body: [
      '                  When I behold Thee, almost slain,',
      '                  With one and all parts full of pain:',
      "                  I'll call, and cry out, thanks to Thee.",
    ],
  },
  268: {
    head: null, // bare numeral — Pollard prints only "268." with no title
    body: [ // VERBATIM from PG #22421 lines 20103-20141
      '                    This   crosstree   here',
      '                    Doth    Jesus     bear,',
      "                    Who   sweet'ned   first",
      '                    The   death   accurs\'d.',
      '    Here all things ready are, make haste, make haste away;',
      '    For long this  work will be,  and very short  this day.',
      '                    Meanwhile   let     me,',
      '                    Beneath   this    tree,',
      '                    This    honour    have,',
      '                    To   make   my   grave.',
    ],
  },
  269: {
    head: "269. TO HIS SAVIOUR'S SEPULCHRE: HIS DEVOTION.",
    body: [
      "    Hail, holy and all-honour'd tomb,",
      '    By no ill haunted; here I come,',
      '    With shoes put off, to tread thy room.',
    ],
  },
  271: {
    head: '271. HIS COMING TO THE SEPULCHRE.',
    body: [
      '    O times still bad, and worse to come!',
      '    Yet I shall find a blessed tomb,',
      '    And the reader body clears the filter char count too.',
    ],
  },
};

function nobleNumbers(): string {
  const poems: string[] = [];
  for (let n = 1; n <= 271; n++) {
    const r = REAL[n];
    const head = r ? (r.head === null ? `${n}.` : r.head) : `${n}. POEM ${n}.`;
    const body = r
      ? r.body
      : [`    Verse for poem ${n} line one, sufficiently long to pass.`, `    Verse for poem ${n} line two, body clears the filter.`];
    poems.push(`${head}\n\n${body.join('\n')}\n`);
  }
  return (
    HESPERIDES_FRONT +
    '\n HIS NOBLE NUMBERS:\n\n' +
    poems.join('\n') +
    'POEMS\n\nNOT INCLUDED IN _HESPERIDES_.\n\n' +
    'THE DESCRIPTION OF A WOMAN.\n\n' +
    '    An appendix poem after the scope end, which must never ride into\n' +
    '    the kept set because the scope end excluded it from the selection.\n'
  );
}

const FULL = nobleNumbers();
const profile = PROFILES['herrick-noble-numbers'];

describe('PROFILES[herrick-noble-numbers]', () => {
  it('the profile exists and is poetry-register scoped with a numbered spec', () => {
    // RED-PROOF: pre-profile this is undefined and every test below fails with it.
    expect(profile).toBeDefined();
    expect(profile!.register).toBe('poetry');
    expect(profile!.sections).toBeDefined();
    // The fix removed the false expectMissing declaration: the numbered
    // sequence is 1..271 COMPLETE, with no declared gaps.
    expect(profile!.sections!.numbered).toBeDefined();
    expect(profile!.sections!.numbered!.first).toBe(1);
    expect(profile!.sections!.numbered!.last).toBe(271);
    expect(profile!.sections!.numbered!.expectMissing).toBeUndefined();
    // The widened pattern admits a bare numeral (empty title is one valid shape).
    expect('268.'.match(profile!.sections!.numbered!.pattern)).not.toBeNull();
    expect('268.'.match(profile!.sections!.numbered!.pattern)![2]).toBe('');
    expect('267. HIS ANTHEM.'.match(profile!.sections!.numbered!.pattern)).not.toBeNull();
  });

  it('RED-PROOF — yields all 271 numbered poems with NO gaps (poem 268 present, not swallowed)', () => {
    const result = scopedSections(FULL, profile!.sections!);
    expect(result.sections.length).toBe(271);
    expect(result.filtered.length).toBe(0); // nothing declared-but-dropped silently
    // Every number 1..271 appears exactly once, in order, as a discrete section.
    for (let n = 1; n <= 271; n++) {
      const s = result.sections[n - 1]!;
      expect(s.heading!.startsWith(`${n}.`)).toBe(true);
    }
  });

  it('RED-PROOF — poem 268 is a discrete section, headed by its first verse line (bare-numeral handling)', () => {
    const result = scopedSections(FULL, profile!.sections!);
    const s268 = result.sections.find((s) => s.heading?.startsWith('268.'));
    expect(s268).toBeDefined();
    // cleanHeading collapses the verse's internal spacing: "This   crosstree   here" → "This crosstree here".
    expect(s268!.heading).toBe('268. This crosstree here');
    // The body starts AFTER the folded first line (the Holy-Sonnets children
    // convention): heading\nbody composes the whole poem, no duplicated line.
    expect(s268!.body).toContain('Doth');
    expect(s268!.body).toContain('To   make   my   grave.');
    expect(s268!.body).not.toContain('This   crosstree   here'); // folded into the heading, not duplicated
    // The composed reader text (heading + "\n" + body) preserves the FULL poem,
    // including the first verse line that now lives in the heading.
    const composed = `${s268!.heading}\n${s268!.body}`;
    expect(composed).toContain('crosstree');
    expect(composed).toContain('To   make   my   grave.');
  });

  it('RED-PROOF — poem 267 does not contain poem 268 (no bare 268 heading line, no absorbed verse)', () => {
    const result = scopedSections(FULL, profile!.sections!);
    const s267 = result.sections.find((s) => s.heading?.startsWith('267.'));
    expect(s267).toBeDefined();
    expect(s267!.heading).toBe('267. HIS ANTHEM TO CHRIST ON THE CROSS.');
    // Pre-fix: 267's body was sliced all the way to 269's heading, swallowing
    // the bare "268." line AND poem 268's verse. Both must now be absent.
    expect(s267!.body).toContain('behold Thee'); // 267's own verse survives
    expect(/^268\.$/m.test(s267!.body)).toBe(false); // no stray bare heading
    expect(s267!.body).not.toContain('crosstree'); // no absorbed 268 verse
    expect(s267!.body).not.toContain('To   make   my   grave.');
    // And 268's body is no longer glued to 267: 267's char count drops sharply.
    expect(s267!.body.length).toBeLessThan(200); // ~100 post-fix; was 1591 pre-fix
  });

  it('CONTROL — the sequence-boundary poems 1 and 271 are intact', () => {
    const result = scopedSections(FULL, profile!.sections!);
    expect(result.sections[0]!.heading).toBe('1. HIS CONFESSION.');
    expect(result.sections[0]!.body).toContain('Look how our foul days');
    expect(result.sections[270]!.heading).toBe('271. HIS COMING TO THE SEPULCHRE.');
    expect(result.sections[270]!.body).toContain('O times still bad');
  });

  it('CONTROL — the secular Hesperides front matter is excluded from kept', () => {
    const result = scopedSections(FULL, profile!.sections!);
    const kept = result.sections.map((s) => `${s.heading}\n${s.body}`).join('\n');
    // The dryrun's secular probes all live in the Hesperides front matter
    // (outside the Noble Numbers scope) and must NOT leak into the kept set.
    expect(kept).not.toContain('THE ARGUMENT OF HIS BOOK');
    expect(kept).not.toContain('TO DIANEME');
    expect(kept).not.toContain('DELIGHT IN DISORDER');
    // The front-matter Hesperides poem numbers (>271) never appear as kept
    // headings, so a scope-isolation regression would trip the `extra` guard.
    expect(result.sections.some((s) => s.heading?.startsWith('999.') || s.heading?.startsWith('998.'))).toBe(false);
  });

  it('CONTROL — the appendix after the scope end is excluded from kept', () => {
    const result = scopedSections(FULL, profile!.sections!);
    const kept = result.sections.map((s) => `${s.heading}\n${s.body}`).join('\n');
    expect(kept).not.toContain('THE DESCRIPTION OF A WOMAN');
  });

  it('RED-PROOF (latent-bug closure) — a present bare-numeral 268 declared expectMissing now ABORTS (declared-gap-but-present)', () => {
    // The latent defect: a present-but-unmatched numeral hidden behind an
    // expectMissing declaration. With the widened pattern, poem 268 IS matched
    // and counted in `seen`; if a future profile re-declares expectMissing:[268],
    // the `unaccounted` check (declared-missing-but-present) fires FAIL CLOSED
    // rather than silently hiding the poem. Pre-fix this throw never fired.
    const latentGuard: ScopedSpec = {
      scope: { start: /^ HIS NOBLE NUMBERS:$/, end: /^POEMS$/, endNext: /^NOT INCLUDED IN _HESPERIDES_\.$/ },
      numbered: { pattern: /^(\d{1,3})\.\s*(.*)$/, first: 1, last: 271, expectMissing: [268] },
    };
    expect(() => scopedSections(FULL, latentGuard)).toThrow(/FAIL CLOSED.*declared-gap-but-present.*268/);
  });

  it('FAIL CLOSED — losing the bare 268 heading aborts as numbered sequence drift (missing [268])', () => {
    // Remove just the bare "268." heading line; its body remains, so 267 would
    // absorb it again, but the sequence guard now sees the real gap and throws.
    const drifted = FULL.replace('268.\n\n', '');
    expect(() => scopedSections(drifted, profile!.sections!)).toThrow(/FAIL CLOSED.*numbered sequence drift.*missing.*268/);
  });

  it('FAIL CLOSED — losing poem 271 aborts as numbered sequence drift (missing [271])', () => {
    const drifted = FULL.replace('271. HIS COMING TO THE SEPULCHRE.\n', '');
    expect(() => scopedSections(drifted, profile!.sections!)).toThrow(/FAIL CLOSED.*numbered sequence drift.*missing.*271/);
  });

  it('FAIL CLOSED — a text without the part-title is refused at the scope start', () => {
    expect(() => scopedSections('1. HIS CONFESSION.\n\nSome body text without the title.', profile!.sections!)).toThrow(/scope start/);
  });

  it('FAIL CLOSED — a text without the appendix end-pair is refused at the scope end', () => {
    const noEnd = FULL.replace('POEMS\n\nNOT INCLUDED IN _HESPERIDES_.\n\n', '');
    expect(() => scopedSections(noEnd, profile!.sections!)).toThrow(/scope end/);
  });

  it('buildSections routes through scopedSections for the profile (same 271 sections)', () => {
    // buildSections is the production entry point (acquireGutenberg → buildSections).
    const secs = buildSections(FULL, profile!);
    expect(secs.length).toBe(271);
    expect(secs[267]!.heading).toBe('268. This crosstree here');
  });
});
