// THE PUBLISH-FLIP TOOLCHAIN'S GUARANTEES, AS TESTS RATHER THAN AS PROSE.
//
// THE FINDING THIS CLOSES (2026-08-02 audit, CONFIRMED). The three scripts that perform this
// project's one legally irreversible write — publish-flip.mjs, its guard, and the A3 adjudicator —
// shipped with ZERO committed tests. Their 22 "red-proof" cases existed only as a numbered list in
// a markdown file: a record that someone once watched them refuse, on a machine, once. Nothing
// re-runs it. A guard whose refusals are asserted in a commit message and checked by nobody is the
// second shape on this repo's failure-mode watchlist — a verdict computed separately from the
// report of that verdict — pointed at the one operation that cannot be undone.
//
// Six defects were then found in that untested code by reading it, four of them in refusals the
// prose claimed had been proved. Every one of those six is a case below.
//
// WHAT IS AND IS NOT COVERED HERE. Everything pure: the target guard, the row decisions, and the
// adjudicator's refusals (driven as a subprocess, since it is a script that exits). Not covered:
// the transaction itself, the owner gate, the TTY requirement and the server-side role assert,
// which need a database. Those are exercised by the throwaway-Postgres rehearsal recorded in
// docs/evidence/work-order-v2-stage2/. This file does not pretend to replace that; it makes the
// half that CAN run in CI actually run in CI.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertPublishTarget, assertStrongTls } from '../scripts/lib/publish-flip-guard.mjs';
import { eligibility, flipDelta } from '../scripts/lib/publish-flip-delta.mjs';
import { endpointId } from '../scripts/lib/target-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The real production endpoint, as A2 measured it. Not a prefix of it. */
const PROD_HOST = 'ep-odd-fog-atnykudm.us-east-1.aws.neon.tech';
const PROD_ID = 'ep-odd-fog-atnykudm';
const url = (host: string) => `postgresql://neondb_owner:pw@${host}/neondb?sslmode=require`;

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('the target guard refuses everything it claims to refuse', () => {
  it('accepts the real production endpoint, declared exactly, with the override set', () => {
    // The positive control. Without it every refusal below could pass by refusing everything.
    expect(assertPublishTarget(url(PROD_HOST), { allow: true, declared: PROD_ID })).toBe(PROD_HOST);
  });

  it('refuses a missing or empty connection string', () => {
    for (const bad of [undefined, null, '', '   ']) {
      expect(() => assertPublishTarget(bad as string, { allow: true, declared: PROD_ID })).toThrow(/no connection string/);
    }
  });

  it('refuses an unparseable connection string WITHOUT echoing it', () => {
    // The value may carry a password. The message must name the failure, not the input.
    let msg = '';
    try {
      assertPublishTarget('postgresql://user:SUPERSECRETPW@bad host/db', { allow: true, declared: PROD_ID });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/not a parseable URL/);
    expect(msg).not.toContain('SUPERSECRETPW');
  });

  it('refuses a real endpoint with no PUBLISH_ALLOW — including a DEV one', () => {
    expect(() => assertPublishTarget(url(PROD_HOST), { allow: false, declared: PROD_ID })).toThrow(/explicit override/);
    // Dev is deliberately NOT exempt: "I thought I was on dev" is the mistake that must cost a
    // declaration, because publishing is the legal act.
    expect(() => assertPublishTarget(url('ep-tiny-hat-123.us-east-1.aws.neon.tech'), { allow: false })).toThrow(
      /explicit override/,
    );
  });

  it('refuses a declaration that is a PREFIX of the endpoint id, not the id', () => {
    // THE DEFECT THAT WOULD HAVE BITTEN FIRST: both scripts printed a ready-to-paste command
    // carrying PUBLISH_EXPECT_HOST=ep-odd-fog. The endpoint is ep-odd-fog-atnykudm. The operator
    // would have pasted the command the tool printed and been refused by that same tool.
    expect(endpointId(PROD_HOST)).toBe(PROD_ID);
    expect(() => assertPublishTarget(url(PROD_HOST), { allow: true, declared: 'ep-odd-fog' })).toThrow(
      /not the declared endpoint/,
    );
  });

  it('refuses a declaration of the wrong endpoint, and an absent one', () => {
    expect(() => assertPublishTarget(url(PROD_HOST), { allow: true, declared: 'ep-tiny-hat' })).toThrow(/not the declared/);
    expect(() => assertPublishTarget(url(PROD_HOST), { allow: true })).toThrow(/PUBLISH_EXPECT_HOST=\(unset\)/);
  });

  it('refuses an ATTACKER DOMAIN carrying the real endpoint id as its first label', () => {
    // endpointId takes split('.')[0], so `ep-odd-fog-atnykudm.attacker.example` yields the genuine
    // production endpoint id and satisfied declaredMatches. Declaring the true production host
    // still routed the write to someone else's database. The first fix pinned the label and not
    // the domain, and this case still passed — hence the explicit *.neon.tech requirement.
    for (const evil of [
      `${PROD_ID}.attacker.example`,
      `${PROD_ID}.us-east-1.aws.neon.tech.attacker.example`,
      `${PROD_ID}.neon.tech.evil.io`,
    ]) {
      expect(() => assertPublishTarget(url(evil), { allow: true, declared: PROD_ID }), evil).toThrow(
        /not a \*\.neon\.tech host/,
      );
    }
  });

  it('refuses a host that is not a Neon endpoint at all', () => {
    expect(() => assertPublishTarget(url('db.example.com'), { allow: true, declared: 'db' })).toThrow(/not the declared|does not look like/);
  });

  it('refuses LOCALHOST unless the red-proof flag is set', () => {
    expect(() => assertPublishTarget('postgresql://u:p@localhost:5433/x', { allow: true })).toThrow(/red-proof only/);
    expect(assertPublishTarget('postgresql://u:p@localhost:5433/x', { allow: true, localOk: true })).toBe('localhost:5433');
    expect(assertPublishTarget('postgresql://u:p@127.0.0.1:5433/x', { allow: true, localOk: true })).toBe('127.0.0.1:5433');
  });

  it('refuses --local-redproof pointed at a REAL endpoint — the C3 hole', () => {
    // THE WORST DEFECT THE 2026-08-02 AUDIT FOUND, and it was in this guard. `localOk` was
    // consulted only inside the isTrulyLocal branch, so a production URL skipped that branch
    // entirely and passed the ordinary checks. Verified by execution at the time:
    //   assertPublishTarget(<prod url>, {allow:true, declared:'ep-odd-fog-atnykudm', localOk:true})
    //     -> ACCEPTED
    // Downstream, --local-redproof skips the TTY refusal, returns from ownerGate() immediately
    // and disables TLS. One argv token made the irreversible write unattended.
    // SEED: move the `localOk && !local` check back inside the isTrulyLocal branch -> RED.
    expect(() => assertPublishTarget(url(PROD_HOST), { allow: true, declared: PROD_ID, localOk: true })).toThrow(
      /--local-redproof was set but .* is not local/,
    );
    // ...and a declared DEV endpoint is no more exempt than production.
    expect(() =>
      assertPublishTarget(url('ep-tiny-hat-123.us-east-1.aws.neon.tech'), {
        allow: true,
        declared: 'ep-tiny-hat-123',
        localOk: true,
      }),
    ).toThrow(/is not local/);
    // The legitimate pairing still works, in both directions.
    expect(assertPublishTarget('postgresql://u:p@localhost:5433/x', { allow: true, localOk: true })).toBe('localhost:5433');
    expect(assertPublishTarget(url(PROD_HOST), { allow: true, declared: PROD_ID })).toBe(PROD_HOST);
  });

  it('refuses a connection string that would downgrade TLS — the C4 hole', () => {
    // pg does Object.assign({}, config, parse(connectionString)), so the URL wins over the
    // explicit ssl:{rejectUnauthorized:true}. sslmode=no-verify turned verification OFF and
    // sslmode=disable removed TLS entirely, on the production write path, with nothing in the
    // committed artifacts recording it.
    // SEED: delete the WEAK_SSLMODES check -> RED.
    for (const mode of ['disable', 'no-verify', 'allow', 'prefer', 'NO-VERIFY']) {
      expect(() => assertStrongTls(`${url(PROD_HOST).split('?')[0]}?sslmode=${mode}`), mode).toThrow(/sslmode=/);
    }
    // verify-full and an absent sslmode are both fine.
    expect(() => assertStrongTls(`${url(PROD_HOST).split('?')[0]}?sslmode=verify-full`)).not.toThrow();
    expect(() => assertStrongTls(url(PROD_HOST).split('?')[0]!)).not.toThrow();
    // The local red-proof path runs against a throwaway with no TLS at all; exempt by design.
    expect(() => assertStrongTls('postgresql://u:p@localhost:5433/x?sslmode=disable', { localOk: true })).not.toThrow();
  });

  it('refuses a host that merely BEGINS with localhost, even in red-proof mode', () => {
    // target-guard's isLocalHost uses an unanchored startsWith. The local branch returns BEFORE
    // the owner gate, the TTY requirement and the server-side role assert, so a host that only
    // looks local must never reach it. `localhostage` needs no dot and passed the original test.
    for (const evil of ['localhost.attacker.example', '127.0.0.1.attacker.example', 'localhostage.evil.io']) {
      expect(() => assertPublishTarget(url(evil), { allow: true, localOk: true, declared: PROD_ID }), evil).toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('eligibility: a listed slug is never silently skipped', () => {
  const beforeBy = new Map([
    ['matthew-henry', 'staged'],
    ['john-gill', 'published'],
    ['olney-hymns', 'quarantined'],
    ['fresh-work', 'ingesting'],
  ]);

  it('splits staged / already-published / absent', () => {
    const r = eligibility(['matthew-henry', 'john-gill', 'nobody'], beforeBy, 'staged', 'published');
    expect(r.eligible).toEqual(['matthew-henry']);
    expect(r.already).toEqual(['john-gill']);
    expect(r.missing).toEqual(['nobody']);
    expect(r.thirdStatus).toEqual([]);
  });

  it('reports a THIRD status rather than folding it into "already published"', () => {
    // The shipped defect: `eligible` was the staged ones and the log said "the rest are already
    // published". A quarantined work was skipped by the UPDATE and reported as done.
    const r = eligibility(['matthew-henry', 'olney-hymns', 'fresh-work'], beforeBy, 'staged', 'published');
    expect(r.thirdStatus).toEqual(['olney-hymns', 'fresh-work']);
    expect(r.already).toEqual([]);
  });

  it('is symmetric under --reverse', () => {
    const r = eligibility(['john-gill', 'matthew-henry'], beforeBy, 'published', 'staged');
    expect(r.eligible).toEqual(['john-gill']);
    expect(r.already).toEqual(['matthew-henry']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('flipDelta: the ONLY rows that changed are the listed slugs', () => {
  const before = [
    { slug: 'a-work', status: 'staged' },
    { slug: 'b-work', status: 'staged' },
    { slug: 'c-work', status: 'published' },
  ];
  const named = ['a-work'];
  const delta = (after: { slug: string; status: string }[]) => flipDelta(before, after, named, 'staged', 'published');

  it('the clean flip yields nothing', () => {
    expect(delta([
      { slug: 'a-work', status: 'published' },
      { slug: 'b-work', status: 'staged' },
      { slug: 'c-work', status: 'published' },
    ])).toEqual([]);
  });

  it('catches an UNNAMED row moving', () => {
    expect(delta([
      { slug: 'a-work', status: 'published' },
      { slug: 'b-work', status: 'published' },
      { slug: 'c-work', status: 'published' },
    ])).toEqual(['b-work: staged -> published']);
  });

  it('catches a named row moving in the WRONG DIRECTION', () => {
    expect(delta([
      { slug: 'a-work', status: 'quarantined' },
      { slug: 'b-work', status: 'staged' },
      { slug: 'c-work', status: 'published' },
    ])).toEqual(['a-work: staged -> quarantined']);
  });

  it('catches an INSERT', () => {
    expect(delta([
      { slug: 'a-work', status: 'published' },
      { slug: 'b-work', status: 'staged' },
      { slug: 'c-work', status: 'published' },
      { slug: 'smuggled', status: 'published' },
    ])).toEqual(['smuggled: ABSENT -> published']);
  });

  it('catches a DELETION — the case the shipped loop could not see', () => {
    // The original iterated `after` only, and before.length appeared in a log and in no
    // comparison. Under READ COMMITTED (never overridden anywhere in this toolchain) a concurrent
    // DELETE between the snapshot and the re-read showed up as silent absence and passed.
    expect(delta([
      { slug: 'a-work', status: 'published' },
      { slug: 'c-work', status: 'published' },
    ])).toEqual(['b-work: staged -> DELETED']);
    // Including a deletion of a row that was already published — no status change to notice.
    expect(delta([
      { slug: 'a-work', status: 'published' },
      { slug: 'b-work', status: 'staged' },
    ])).toEqual(['c-work: published -> DELETED']);
  });

  it('reports several at once rather than stopping at the first', () => {
    expect(delta([
      { slug: 'a-work', status: 'published' },
      { slug: 'c-work', status: 'staged' },
      { slug: 'smuggled', status: 'published' },
    ])).toEqual([
      'b-work: staged -> DELETED',
      'c-work: published -> staged',
      'smuggled: ABSENT -> published',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The adjudicator is a script that exits, so it is driven as one. Offline by construction: it
// reads a JSON file and touches no database, which is the entire reason A3 can be tested at all.
describe('the A3 adjudicator refuses a census it must not adjudicate', () => {
  const CENSUS = path.join(ROOT, 'docs/evidence/a3-adjudication-2026-08-01/a2-census.json');
  const good = JSON.parse(fs.readFileSync(CENSUS, 'utf8')) as Record<string, unknown>;

  /**
   * Run the adjudicator over a mutated census; return its exit code, stderr, and — when it wrote
   * one — the flip payload. The payload matters because the A3 rule has TWO consequences and only
   * one of them is an exit code: a work that is not admitted also never reaches the flip list, so
   * a defect can narrow the payload to nothing while every refusal test stays green.
   */
  function run(mutate: (c: Record<string, unknown>) => void): {
    code: number;
    err: string;
    out?: { slugs: string[]; admittedBy: Record<string, number> };
  } {
    const c = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
    mutate(c);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a3-'));
    const file = path.join(dir, 'census.json');
    const outFile = path.join(dir, 'out.json');
    fs.writeFileSync(file, JSON.stringify(c));
    const readOut = () =>
      fs.existsSync(outFile)
        ? (JSON.parse(fs.readFileSync(outFile, 'utf8')) as { slugs: string[]; admittedBy: Record<string, number> })
        : undefined;
    try {
      execFileSync('npx', ['tsx', 'scripts/publish-flip-adjudicate.mts', `--census=${file}`, `--out=${outFile}`], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return { code: 0, err: '', out: readOut() };
    } catch (e) {
      const x = e as { status?: number; stderr?: string };
      return { code: x.status ?? -1, err: x.stderr ?? '', out: readOut() };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  /** A census row the adjudicator must decide admission for ITSELF (no measured `admitted`). */
  function addRow(c: Record<string, unknown>, row: Record<string, unknown>) {
    (c.sources as unknown[]).push(row);
    c.expectedSourceCount = (c.sources as unknown[]).length;
  }

  it('adjudicates the REAL production census — the positive control', () => {
    expect(run(() => {}).code).toBe(0);
  });

  it('refuses a host that is not production, however it is dressed up', () => {
    // `.includes()` accepted `ep-shadow-ep-odd-fog-9999`; a label-only check accepted an attacker
    // domain carrying the real id. Both are refusals now.
    for (const host of ['ep-tiny-hat-abc', 'ep-shadow-ep-odd-fog-9999', 'ep-odd-fog-atnykudm.attacker.example', '']) {
      expect(run((c) => { c.host = host; }).code, host || '(empty)').toBe(2);
    }
  });

  it('refuses a PUBLISHED cohort — that would mean the flip already ran', () => {
    expect(run((c) => { c.cohort = 'published'; }).code).toBe(2);
  });

  it('refuses an empty source list rather than issuing a clean bill of health over nothing', () => {
    const r = run((c) => { c.sources = []; c.expectedSourceCount = 0; });
    expect(r.code).toBe(2);
  });

  it('refuses a census whose row count disagrees with its own declared total', () => {
    const r = run((c) => { (c.sources as unknown[]).pop(); });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/went missing/);
  });

  it('refuses a census with no rollupDigest — an untraceable verdict', () => {
    expect(run((c) => { delete c.rollupDigest; }).code).toBe(2);
  });

  // ── B2: admission covers the SONG/VERSE register, not just prose and lanes ────────────────
  // The adjudicator composed its admission set as SERVED_PROSE_WORKS ∪ SERVED_LANE_WORKS, which
  // omits SERVED_SONG_VERSE_WORKS. These three cases drive the two consequences and the guard
  // against over-correcting. Each row is added WITHOUT an `admitted` field on purpose: that is
  // what makes the adjudicator decide admission from its own set (adjudicate.mts, "otherwise
  // decide it here"), which is the code path B2 fixes. A row carrying a measured `admitted` would
  // route around the defect entirely and the test would prove nothing.
  it('a PUBLISHED hymn does not STOP the flip — it is served by SONG_VERSE_CORPUS_FILTER', () => {
    // SEED: drop `songVerse` from SERVED_WORK_LISTS -> RED, exit 1, "PUBLISHED BUT NOT ADMITTED".
    const r = run((c) => addRow(c, { slug: 'olney-hymns', source_type: 'hymn', status: 'published', sections: 348 }));
    expect(r.code, r.err).toBe(0);
  });

  it('a STAGED hymn reaches the flip list — the consequence no exit code reports', () => {
    // The quieter half of the defect: with song/verse unadmitted, `admitted && staged` can never
    // select a hymn, so A8 would have silently published sermons/theology only.
    const r = run((c) => addRow(c, { slug: 'watts-hymns', source_type: 'hymn', status: 'staged', sections: 697 }));
    expect(r.code, r.err).toBe(0);
    expect(r.out?.slugs).toContain('watts-hymns');
  });

  it('a published work in NO served list still STOPS — the fix did not just admit everything', () => {
    const r = run((c) => addRow(c, { slug: 'thayers-lexicon', source_type: 'lexicon', status: 'published', sections: 1 }));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/NOT ADMITTED/i);
  });

  it('refuses a DUPLICATE slug, which would inflate the flip list', () => {
    const r = run((c) => {
      const rows = c.sources as unknown[];
      rows.push(JSON.parse(JSON.stringify(rows[0])));
      c.expectedSourceCount = rows.length;
    });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/more than once/);
  });

  it('refuses a value that is not a slug', () => {
    const r = run((c) => {
      ((c.sources as Record<string, unknown>[])[0]!).slug = "x'; DROP TABLE sources; --";
    });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/not a slug/);
  });
});
