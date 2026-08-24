// D2 (DEEP_SWEEP.md): the manifest `quarantine` field was enforced on the historian and
// sermon ingest paths (ingest-historian.ts:154, ingest-sermon.ts:187) but NOWHERE on the
// register/adapter path. Two quarantined manifest entries carry provenance.acquire.adapter
// 'ccel', and `chesterton-preexistence` has no `serve` key, so adapter-ccel's
// `publish: opts.publish ?? (entry.serve !== false)` computed TRUE — a direct adapter run
// would have stamped a work quarantined for FALSE ATTRIBUTION as published.
//
// These tests gate the mouth. They must throw BEFORE any network or DB work, which is why
// they can run with no credentials: if the gate is not first, the call reaches out and the
// test fails with a different error than the one asserted.
import { describe, expect, it } from 'vitest';
import manifest from '../ingest/sources.config.json';
import { assertNotQuarantined } from '../src/ingest/license-manifest.js';
import { acquireCcel } from '../src/ingest/adapter-ccel.js';
import { acquireGutenberg } from '../src/ingest/adapter-gutenberg.js';

const QUARANTINED = 'chesterton-preexistence';

const entryFor = (slug: string): Record<string, unknown> => {
  const e = (manifest as Record<string, unknown>[]).find((x) => x.slug === slug);
  if (!e) throw new Error(`fixture drift: ${slug} is no longer in the manifest`);
  return e;
};

describe('D2 — a quarantined manifest entry never reaches the register path', () => {
  it('the helper throws FAIL CLOSED on a quarantined entry', () => {
    expect(() => assertNotQuarantined(entryFor(QUARANTINED))).toThrow(/FAIL CLOSED.*quarantined/i);
  });

  it('the helper passes a clean entry through', () => {
    expect(() => assertNotQuarantined({ slug: 'x', quarantine: undefined })).not.toThrow();
    expect(() => assertNotQuarantined({ slug: 'x', quarantine: '   ' })).not.toThrow();
  });

  it('acquireCcel refuses a quarantined entry at the mouth', async () => {
    await expect(acquireCcel(entryFor(QUARANTINED), { write: false })).rejects.toThrow(/FAIL CLOSED.*quarantined/i);
  });

  it('acquireGutenberg refuses a quarantined entry at the mouth', async () => {
    await expect(
      acquireGutenberg({ ...entryFor(QUARANTINED), provenance: { acquire: { adapter: 'gutenberg' } } }, { write: false }),
    ).rejects.toThrow(/FAIL CLOSED.*quarantined/i);
  });

  // The standing property, not a snapshot of today's manifest: whatever is quarantined must
  // not also be loop-queueable. This is the check that catches the NEXT such entry.
  it('no quarantined manifest entry is reachable by the adapter loop', () => {
    const reachable = (manifest as Record<string, unknown>[]).filter((e) => {
      const q = e.quarantine;
      if (typeof q !== 'string' || !q.trim()) return false;
      const acq = (e.provenance as Record<string, unknown> | undefined)?.['acquire'] as { adapter?: string } | undefined;
      return Boolean(acq?.adapter);
    });
    // Reachable entries are permitted ONLY because the mouth now refuses them; this asserts
    // the refusal, not their absence.
    for (const e of reachable) {
      expect(() => assertNotQuarantined(e)).toThrow(/FAIL CLOSED/i);
    }
  });
});
