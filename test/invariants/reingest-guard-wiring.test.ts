// THE RE-INGEST GUARD IS CALLED, AND CALLED IN THE RIGHT PLACE — deep audit M21 + M22.
//
// `assertReingestable` locks the `sources` row FOR UPDATE. That lock is worth nothing outside a
// transaction: in autocommit, Postgres takes it and releases it on the same statement, so the
// check succeeds and the window it exists to close is still open. And there is no reliable
// server-side way to ask "am I inside a transaction block" — `transaction_isolation` reads
// identically either way, and `pg_current_xact_id_if_assigned()` is null until a write happens.
//
// So the precondition is enforced HERE, statically, over the three callers: the call must sit
// AFTER the `BEGIN` and BEFORE the `DELETE FROM sections`. This is the same reasoning as the
// H3 throttle-wiring check — a guard that cannot verify its own precondition at runtime gets
// verified where it can be.
//
// The defect being pinned, verbatim from the audit: `ingest-sermon.ts:198-202` and
// `ingest-historian.ts:142-146` ran the status SELECT BEFORE `BEGIN`, and the destructive DELETE
// ran in the transaction that followed. Six works became publishable on 2026-08-01, which is when
// that window started mattering. `migrate-sections-slice.ts` had no such check at all, and it is
// the script that wrote all 72,863 production sections.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeOnly } from '../../scripts/lib/source-scan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Every file that deletes a work's sections. Derived below from the tree, not trusted as typed.
const CALLERS = [
  'src/ingest/ingest-sermon.ts',
  'src/ingest/ingest-historian.ts',
  'src/ingest/migrate-sections-slice.ts',
  // These two the audit did not name. The derivation below found them on the first run, which is
  // the argument for deriving: its list said three writers and the tree holds five.
  'src/ingest/repoint-sections-work.ts',
  'src/ingest/suppress-chrysostom-prolegomena.ts',
  // Added 2026-08-02, by this test. register-writer gained a shelf-store delete so that an
  // adapter-ingested work becomes visible at all, and it landed in a helper running in AUTOCOMMIT
  // with no lock and no published check — the exact pre-2026-08 shape. The derived check below
  // found it on the same day it was written, which is the argument for deriving the list.
  'src/ingest/register-writer.ts',
];

const read = (rel: string) => codeOnly(readFileSync(path.join(REPO, rel), 'utf8'));

describe('every destructive re-ingest calls the guard, inside its transaction', () => {
  it.each(CALLERS)('%s calls assertReingestable between BEGIN and DELETE FROM sections', (rel) => {
    // SEED: move the call above `BEGIN` (the pre-2026-08 shape) -> RED.
    // SEED: delete the call -> RED.
    const code = read(rel);
    const begin = code.indexOf("query('BEGIN')");
    const guard = code.indexOf('assertReingestable(');
    const del = code.search(/DELETE FROM sections WHERE source_id/);

    expect(begin, `${rel}: no BEGIN`).toBeGreaterThan(-1);
    expect(guard, `${rel}: never calls assertReingestable`).toBeGreaterThan(-1);
    expect(del, `${rel}: no DELETE FROM sections — is this still a destructive writer?`).toBeGreaterThan(-1);
    expect(guard, `${rel}: the guard runs BEFORE BEGIN, so its FOR UPDATE lock is released immediately`).toBeGreaterThan(begin);
    expect(guard, `${rel}: the guard runs AFTER the DELETE, which is no guard at all`).toBeLessThan(del);
  });

  it('no OTHER file deletes a work sections without the guard', () => {
    // The list above is hand-written, which is this repo's most-repeated defect — so it is
    // CHECKED against the tree rather than trusted. A new destructive writer turns this red on the
    // commit that adds it, instead of being found by the next audit.
    // SEED: add `DELETE FROM sections WHERE source_id=$1` to any src/ file -> RED.
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = path.join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') || p.endsWith('.mts') ? [p] : [];
      });
    const found = walk(path.join(REPO, 'src'))
      .filter((p) => /DELETE FROM sections WHERE source_id/.test(codeOnly(readFileSync(p, 'utf8'))))
      .map((p) => path.relative(REPO, p))
      .sort();
    expect(found).toEqual([...CALLERS].sort());
  });
});
