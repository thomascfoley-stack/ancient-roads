// EVERY DESTRUCTIVE WRITER REFUSES PRODUCTION, AND THE REFUSAL IS ONE FUNCTION.
//
// THE DEFECT (2026-08-02 deep audit, C5 + M19). Five scripts in this repo delete or truncate
// rows. Four of them could reach production:
//
//   migrate-sections-slice.ts   NO GUARD AT ALL — DELETEs sections/anchors/embeddings for a
//                               source. Exposed as `pnpm migrate:sections-slice`. It is the
//                               script that wrote all 72,863 production sections at the cutover.
//   ingest-commentary-fts.ts    TRUNCATE commentary_entries, gated on the NEON_BRANCH label only.
//   ingest-sermon.ts            DELETE FROM sections, same.
//   ingest-historian.ts         DELETE FROM sections, same.
//   db/migrate.mjs              no guard, and it exited 0 after printing its own failures.
//
// `NEON_BRANCH=dev` exported alongside a production `DATABASE_URL` passed every one of them —
// the connection string was never looked at. `register-writer.ts` was the only script that got
// this right, and its own comment says exactly why ("the label alone is self-attested"). That
// fix was written once and propagated nowhere for three weeks.
//
// Two halves are tested here, and both are load-bearing:
//   1. the guard refuses what it must — driven directly, every branch;
//   2. every destructive writer CALLS it — because a correct guard nobody invokes is a registry,
//      which is the exact thing the audit found on the Neon rollback branch the same day.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertDevOnlyTarget } from '../../src/ingest/dev-only-target.mjs';
import { codeOnly } from '../../scripts/lib/source-scan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROD = 'postgresql://neondb_owner:pw@ep-odd-fog-atnykudm.c-9.us-east-1.aws.neon.tech/neondb';
const DEV = 'postgresql://neondb_owner:pw@ep-tiny-hat-123.us-east-1.aws.neon.tech/neondb';

describe('assertDevOnlyTarget', () => {
  it('accepts a real dev endpoint and localhost — the positive control', () => {
    // Without this, every refusal below could pass by refusing everything.
    expect(assertDevOnlyTarget(DEV, 'dev')).toContain('ep-tiny-hat');
    expect(assertDevOnlyTarget('postgresql://u:p@localhost:5433/x', 'test')).toBe('localhost:5433');
  });

  it('REFUSES production even when the label says dev — the live hole', () => {
    // SEED: drop the endpoint check and keep only the branch check -> RED.
    expect(() => assertDevOnlyTarget(PROD, 'dev')).toThrow(/is not a dev endpoint/);
    expect(() => assertDevOnlyTarget(PROD, 'test')).toThrow(/is not a dev endpoint/);
  });

  it('REFUSES a dev endpoint when the label is absent or wrong', () => {
    // The URL alone is not enough either: an unlabelled run must not rewrite a dev box.
    for (const bad of [undefined, '', 'prod', 'production', 'Dev']) {
      expect(() => assertDevOnlyTarget(DEV, bad), String(bad)).toThrow(/NEON_BRANCH=/);
    }
  });

  it('REFUSES a host that merely contains a dev marker', () => {
    // Anchored on the host's first label, not a substring of the URL. A database name or a
    // password containing "ep-tiny-hat" must not satisfy a production guard.
    for (const evil of [
      'postgresql://u:p@ep-odd-fog-atnykudm.neon.tech/ep-tiny-hat',
      'postgresql://u:ep-tiny-hat@ep-odd-fog-atnykudm.neon.tech/neondb',
      'postgresql://u:p@shadow-ep-tiny-hat.neon.tech/neondb',
      'postgresql://u:p@localhost.attacker.example/neondb',
    ]) {
      expect(() => assertDevOnlyTarget(evil, 'dev'), evil).toThrow();
    }
  });

  it('REFUSES a missing or unparseable connection string rather than guessing', () => {
    expect(() => assertDevOnlyTarget(undefined, 'dev')).toThrow(/no DATABASE_URL/);
    expect(() => assertDevOnlyTarget('   ', 'dev')).toThrow(/no DATABASE_URL/);
    expect(() => assertDevOnlyTarget('not a url', 'dev')).toThrow();
  });

  it('never echoes the connection string, which may carry a password', () => {
    let msg = '';
    try {
      assertDevOnlyTarget('postgresql://u:SUPERSECRETPW@ep-odd-fog-atnykudm.neon.tech/neondb', 'dev');
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/is not a dev endpoint/);
    expect(msg).not.toContain('SUPERSECRETPW');
  });
});

describe('every destructive writer actually invokes the guard', () => {
  // A correct guard nobody calls is a registry, not a refusal. Comment-stripped, so the check
  // cannot be satisfied by a file that EXPLAINS the guard it no longer runs.
  const WRITERS = [
    'src/ingest/migrate-sections-slice.ts',
    'src/ingest/ingest-commentary-fts.ts',
    'src/ingest/ingest-sermon.ts',
    'src/ingest/ingest-historian.ts',
    'src/ingest/repoint-sections-work.ts',
    'src/ingest/suppress-nonauthorial-matter.ts',
    'src/ingest/suppress-chrysostom-prolegomena.ts',
    'db/migrate.mjs',
  ];

  it.each(WRITERS)('%s calls assertDevOnlyTarget', (rel) => {
    // SEED: delete the call from any one of these -> RED for that file only.
    const code = codeOnly(readFileSync(path.join(ROOT, rel), 'utf8'));
    expect(code, `${rel} imports the guard`).toMatch(/assertDevOnlyTarget/);
    expect(code, `${rel} CALLS the guard, not merely imports it`).toMatch(/assertDevOnlyTarget\s*\(/);
  });

  it('the writer list is not shorter than the set of files that delete rows', () => {
    // The list above is hand-maintained, which is this repo's most-repeated defect — so it is
    // cross-checked against the tree rather than trusted. Any src/ingest file issuing a DELETE
    // or TRUNCATE against sections/commentary_entries must be on it.
    // Matches SQL, not prose: a DELETE/TRUNCATE inside a query string, so a log line reading
    // "TRUNCATED (Jaccard < …)" does not enrol a read-only probe as a destructive writer.
    const hits = execFileSync(
      'grep',
      ['-rlE', '(DELETE FROM|TRUNCATE)[[:space:]]+(sections|section_[a-z]+|commentary_entries)', 'src/ingest'],
      { cwd: ROOT, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      // register-writer.ts carries its own equivalent guard, documented in dev-only-target.mjs.
      .filter((f) => !f.endsWith('register-writer.ts'))
      // annotate-history-existing.mts is exempt for the OPPOSITE reason register-writer is:
      // its lawful use INCLUDES production (Phase 3 annotated works already serving on prod,
      // owner-gated per AGENTS.md), so assertDevOnlyTarget — which refuses prod outright —
      // would brick the tool's purpose. Its own gate is per-occasion and explicit:
      // ANNOTATE_ALLOW_HOST must be declared and match the target endpoint, or it STOPs
      // before connecting (annotate-history-existing.mts:36-43). Its one DELETE clears only
      // the derived section_history_anchors rows it is about to rebuild, never sections.
      .filter((f) => !f.endsWith('annotate-history-existing.mts'))
      // A GUARD THAT NAMES THE STATEMENT IT GUARDS IS NOT A WRITER. `grep` reads raw bytes, so it
      // enrolled dev-only-target.mjs on its own header, and on 2026-08-02 it enrolled the new
      // reingest-guard.ts on a comment and an error message. The exemption used to be a filename;
      // now the hit is re-checked with comments and string-free code stripped out, which is what
      // the rest of this file already does. A future guard needs no new exemption.
      .filter((f) => /(DELETE FROM|TRUNCATE)\s+(sections|section_[a-z]+|commentary_entries)/.test(
        codeOnly(readFileSync(path.join(ROOT, f), 'utf8')),
      ));
    const missing = hits.filter((f) => !WRITERS.includes(f));
    expect(missing, `destructive files not covered by this test: ${missing.join(', ')}`).toEqual([]);
  });
});
