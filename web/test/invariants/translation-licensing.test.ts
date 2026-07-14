// Layer 1 — translation licensing invariant (LONG_NIGHT finding C1, 2026-07-14).
// The /read reader serves raw Bible text from web/public/bible/<id>/. The served set is
// TRANSLATIONS (web/src/lib/bible.ts) — the picker. docs/ACQUISITION_MANIFEST.md:28 lists
// LEB / LITV / MKJV / LSV (and NASB/NIV/ESV/NLT/CSB) as copyrighted, EXCLUDE. Those four were
// stored full-text AND wired into TRANSLATIONS, shipping to prod with no gate scanning
// public/bible/ — the existential "never store copyrighted translations" risk, live.
// This asserts no forbidden translation is ever offered. Seeded-bug proof: re-add 'leb' to
// TRANSLATIONS and this goes RED.

import { describe, expect, it } from 'vitest';
import { TRANSLATIONS, FORBIDDEN_TRANSLATION_IDS } from '@/lib/bible';

describe('Layer 1 — translation licensing (no copyrighted translation is served)', () => {
  it('TRANSLATIONS contains none of the manifest EXCLUDE ids', () => {
    const forbidden = new Set<string>(FORBIDDEN_TRANSLATION_IDS);
    const offending = TRANSLATIONS.filter((t) => forbidden.has(t.id)).map((t) => t.id);
    expect(
      offending,
      `copyrighted translations offered in the reader (docs/ACQUISITION_MANIFEST.md:28 says EXCLUDE): ${offending.join(', ')}`,
    ).toEqual([]);
  });

  it('every served translation id is unique and non-empty (sanity)', () => {
    const ids = TRANSLATIONS.map((t) => t.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
