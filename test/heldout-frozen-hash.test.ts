// GATE for held-out discipline (THE_LOOP.md rule 5). The frozen v3 launch-gate eval set is
// content-hashed BEFORE any accuracy number exists; editing it in response to failures silently
// re-tunes the test and the number becomes a lie. This pins the hash so ANY byte change to the
// frozen set goes RED — a re-freeze must be INTENTIONAL: mint a new vN file, or bump this pin
// with a WORKLOG note explaining why. Scar: "topical 75" was a 5-doc-pool artifact carried as a
// real number; the discipline that catches that is a frozen, un-tunable eval.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FROZEN_V3 = path.join(__dirname, '../web/src/scripts/heldout-v3-queries.mts');
// sha256 of the frozen v3 set at freeze time. Bump ONLY on a deliberate re-freeze (+ WORKLOG note).
const PINNED_SHA256 = 'f7a771a5d06b2d1315e1bb40cea357b6063228438154f6bc89d49fac2688f295';

const FROZEN_V4 = path.join(__dirname, '../web/src/scripts/heldout-v4-queries.mts');
// sha256 of the frozen v4 set, pinned 2026-07-18 BEFORE any v4 accuracy number existed
// (Phase 3 reconcile-measure). v4 has NO relabel path: a label correction is a deliberate
// re-freeze as v4.1 with a new pin + WORKLOG note, never an in-place edit.
const PINNED_SHA256_V4 = '90de5dc3e9ed22f96cd33ab3c77468db924114e283061faba06a598cda3b2313';

describe('held-out discipline — the frozen v3 eval set may not drift', () => {
  it('FROZEN_V3 content-hash matches the pin (never tune the frozen set to failures)', () => {
    const actual = createHash('sha256').update(readFileSync(FROZEN_V3)).digest('hex');
    expect(
      actual,
      'frozen v3 eval set changed. If this is a deliberate re-freeze, mint a new vN or update ' +
        'PINNED_SHA256 with a WORKLOG note. If it is a fix tuned to failing queries, STOP — that ' +
        'silently re-tunes the launch gate (THE_LOOP.md rule 5).',
    ).toBe(PINNED_SHA256);
  });

  it('FROZEN_V4 content-hash matches the pin (never tune the frozen set to failures)', () => {
    const actual = createHash('sha256').update(readFileSync(FROZEN_V4)).digest('hex');
    expect(
      actual,
      'frozen v4 eval set changed. If this is a deliberate re-freeze, mint v4.1 (new file or ' +
        'new pin + WORKLOG note). If it is a fix tuned to failing queries, STOP — that silently ' +
        're-tunes the launch gate (THE_LOOP.md rule 5).',
    ).toBe(PINNED_SHA256_V4);
  });
});
