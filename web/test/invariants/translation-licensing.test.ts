// Layer 1 — licensing RECORD invariant (T1§2/§3, 2026-07-14). The deploy gate and the reader
// picker both decide from web/src/lib/licensing.ts (block-by-default): a corpus work ships iff
// its record says commercial_use=allow, or conditional AND acknowledged. This asserts the
// picker only offers ship-able translations, the decision logic is correct in both directions,
// the owner's rulings are recorded, and every served commentary author has an allow record.

import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '@/lib/bible';
import {
  TRANSLATION_LICENSES,
  COMMENTARY_LICENSES,
  translationShipDecision,
  shipDecision,
  acknowledgedWorkIds,
  type LicenseRecord,
} from '@/lib/licensing';
import { PUBLISHED_WHOLE_BIBLE_AUTHORS } from '@/lib/legal-corpus';

describe('Layer 1 — translation license record', () => {
  it('every translation in the reader picker has a shipping license record', () => {
    const offending = TRANSLATIONS.filter((t) => !translationShipDecision(t.id).ship).map((t) => t.id);
    expect(offending, `picker offers translations with no shipping license: ${offending.join(', ')}`).toEqual([]);
  });

  it('the gate decision is correct in every direction', () => {
    const rec = (commercial_use: LicenseRecord['commercial_use']): LicenseRecord =>
      ({ license: 'x', commercial_use, source: 't', verified_on: 't' });
    const noAck = new Set<string>();
    expect(shipDecision('w', rec('allow'), noAck).ship, 'allow ships').toBe(true);
    expect(shipDecision('w', rec('deny'), noAck).ship, 'deny blocks').toBe(false);
    expect(shipDecision('w', undefined, noAck).ship, 'no record blocks').toBe(false);
    expect(shipDecision('w', rec('conditional'), noAck).ship, 'conditional w/o ack blocks').toBe(false);
    expect(shipDecision('w', rec('conditional'), new Set(['w'])).ship, 'conditional + ack ships').toBe(true);
  });

  it('LICENSE_ACK is parsed case-insensitively and comma-separated', () => {
    expect(acknowledgedWorkIds('LEB, foo')).toEqual(new Set(['leb', 'foo']));
    expect(acknowledgedWorkIds(undefined)).toEqual(new Set());
  });

  it("records the owner's translation rulings", () => {
    expect(TRANSLATION_LICENSES.litv.commercial_use).toBe('deny');
    expect(TRANSLATION_LICENSES.mkjv.commercial_use).toBe('deny');
    expect(TRANSLATION_LICENSES.jubilee.commercial_use).toBe('deny'); // unknown → deny
    expect(TRANSLATION_LICENSES.leb.commercial_use).toBe('conditional');
    expect(TRANSLATION_LICENSES.lsv.commercial_use).toBe('allow');
    expect(TRANSLATION_LICENSES.lsv.attribution, 'CC BY-SA must carry attribution').toBeTruthy();
  });

  it('every served commentary author has an allow license record', () => {
    const served = [...PUBLISHED_WHOLE_BIBLE_AUTHORS, 'Augustine of Hippo', 'John Chrysostom'];
    const missing = served.filter((a) => COMMENTARY_LICENSES[a]?.commercial_use !== 'allow');
    expect(missing, `served authors without an allow license record: ${missing.join(', ')}`).toEqual([]);
  });
});
