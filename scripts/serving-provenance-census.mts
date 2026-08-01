// WHAT `commentary_entries` ACTUALLY SERVES, BY AUTHOR AND BY PROVENANCE. Read-only.
//
//   NEON_API_KEY=<key> npx tsx scripts/serving-provenance-census.mts --read-only --target=ep-odd-fog [--out=path]
//
// The 2026-08-02 deep audit's H4 and H5 are the same defect seen from two sides, and neither can
// be settled from source alone:
//
//   H4  `barnes-notes` is held back by one boundary and served by another. A3 excluded it and A4
//       left it `staged`, but that binds only the `sources`/`sections` path.
//       LEGAL_COMMENTARY_ENTRIES_PREDICATE lists "Barnes' Notes" in PUBLISHED_WHOLE_BIBLE_AUTHORS
//       and is the ONLY gate on searchCommentaries — a query over `commentary_entries`, which
//       never joins `sources` and never reads `status`.
//
//   H5  the forbidden-aggregator condition was deliberately REMOVED from that predicate.
//       legal-corpus.ts:52-58 records why: it carried `source_url ILIKE '%crosswire%'`, that
//       matched zero rows for Barnes/Wesley/Calvin, and the repair rebuilt it "with no URL
//       condition". The audit reports 45,390 biblehub-sourced entries served as a result.
//
// Both claims are about ROWS. This measures them: every author the predicate admits, with the
// provenance hosts behind those rows, and the `sources.status` of the works they belong to. It
// writes NOTHING and rolls back.
//
// The predicate is IMPORTED from the shipped module, not re-typed — so the census measures the
// gate that is actually deployed, not a look-alike. Same argument as the eval importing
// teacher/routing rather than hand-copying the pool SQL.

import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { LEGAL_COMMENTARY_ENTRIES_PREDICATE } from '../web/src/lib/legal-corpus';
import { LEGAL_CORPUS_FILTER } from '../web/src/lib/teacher/routing';
import { FORBIDDEN_PROVENANCE_DOMAINS } from '../src/ingest/forbidden-provenance.mjs';
import { INSTRUMENT_ROLE, assertReadOnlySession, resolveInstrumentConnection } from './lib/neon-connection.mjs';

const args = process.argv.slice(2);
const targetArg = args.find((a) => a.startsWith('--target='))?.slice('--target='.length);
const outArg = args.find((a) => a.startsWith('--out='))?.slice('--out='.length);
if (!args.includes('--read-only') || !targetArg) {
  console.error('Usage: NEON_API_KEY=<key> npx tsx scripts/serving-provenance-census.mts --read-only --target=<endpoint-id> [--out=path]');
  process.exit(2);
}

const lines: string[] = [];
const say = (s = '') => {
  console.log(s);
  lines.push(s);
};

const conn = resolveInstrumentConnection({ target: targetArg });
const c = new pg.Client({
  connectionString: conn.url,
  ssl: { rejectUnauthorized: true },
  application_name: 'serving-provenance-census',
  statement_timeout: 600_000,
});
await c.connect();

say(`serving provenance census — read-only`);
say(`  host   : ${conn.host}`);
say(`  role   : ${conn.role}`);
say(`  ts     : ${new Date().toISOString()}`);

try {
  await c.query('BEGIN');
  await c.query('SET TRANSACTION READ ONLY');
  await assertReadOnlySession(c, { role: INSTRUMENT_ROLE });
  say(`  read-only transaction confirmed at the server ✓`);

  // POSITIVE CONTROL. A census over an empty table reports "no forbidden provenance" and reads
  // exactly like a clean one. Name the population before drawing any conclusion from it.
  const total = (await c.query<{ n: number }>('SELECT count(*)::int AS n FROM commentary_entries')).rows[0]!.n;
  say(`\ncommentary_entries rows: ${total.toLocaleString()} ${total > 0 ? '✓' : '✗ ABORT — nothing to measure'}`);
  if (total === 0) throw new Error('commentary_entries is empty; a census over it proves nothing');

  // §1 — what the SHIPPED predicate admits, by author, with the provenance behind it.
  const served = await c.query<{
    author: string;
    host: string;
    n: number;
    forbidden: boolean;
  }>(
    `SELECT author,
            COALESCE(NULLIF(substring(source_url from '^(?:[a-z]+://)?([^/?#]+)'), ''), '(empty)') AS host,
            count(*)::int AS n,
            bool_or(EXISTS (SELECT 1 FROM unnest($1::text[]) d
                             WHERE lower(source_url) LIKE '%' || d || '%')) AS forbidden
       FROM commentary_entries
      WHERE ${LEGAL_COMMENTARY_ENTRIES_PREDICATE}
      GROUP BY 1, 2
      ORDER BY 3 DESC`,
    [FORBIDDEN_PROVENANCE_DOMAINS],
  );

  say(`\n§1 ADMITTED BY LEGAL_COMMENTARY_ENTRIES_PREDICATE — author x provenance host`);
  let forbiddenServed = 0;
  for (const r of served.rows) {
    if (r.forbidden) forbiddenServed += r.n;
    say(`  ${String(r.n).padStart(7)}  ${r.author.padEnd(34)} ${r.host}${r.forbidden ? '   ⛔ FORBIDDEN AGGREGATOR' : ''}`);
  }
  const servedTotal = served.rows.reduce((n, r) => n + r.n, 0);
  say(`  ${String(servedTotal).padStart(7)}  TOTAL ADMITTED   (${forbiddenServed.toLocaleString()} from a forbidden aggregator)`);

  // §2 — H4 exactly: does a work held back in `sources` still reach the flat serving path?
  //
  // NOT a join. The shipped predicate is a bare SQL string over UNQUALIFIED column names
  // (`author`, `book`, `work`), and `sources` carries some of the same names — joining the two
  // makes the predicate ambiguous and Postgres refuses it (42702, seen on the first run). Since
  // the predicate must be interpolated exactly as it ships, `commentary_entries` has to be the
  // only relation in scope. The status side is fetched separately in §4 and matched here.
  const bySlug = await c.query<{ work: string | null; n: number; admitted: number }>(
    `SELECT work,
            count(*)::int AS n,
            count(*) FILTER (WHERE ${LEGAL_COMMENTARY_ENTRIES_PREDICATE})::int AS admitted
       FROM commentary_entries
      GROUP BY 1
      ORDER BY 3 DESC`,
  );
  const statusBySlug = new Map(
    (await c.query<{ slug: string; status: string }>('SELECT slug, status FROM sources')).rows.map((r) => [r.slug, r.status]),
  );
  say(`\n§2 THE H4 CROSS-CHECK — commentary_entries.work vs sources.status`);
  say(`     rows  admitted  sources.status  work`);
  for (const r of bySlug.rows) {
    const status = r.work === null ? null : (statusBySlug.get(r.work) ?? null);
    const flag = r.admitted > 0 && status !== null && status !== 'published' ? '   ⛔ ADMITTED WHILE NOT PUBLISHED' : '';
    say(`  ${String(r.n).padStart(7)}  ${String(r.admitted).padStart(8)}  ${String(status ?? '(no sources row)').padEnd(16)} ${r.work ?? '(null)'}${flag}`);
  }

  // §3 — the named author from H4, whatever the `work` column says.
  const barnes = await c.query<{ author: string; host: string; n: number }>(
    `SELECT author,
            COALESCE(NULLIF(substring(source_url from '^(?:[a-z]+://)?([^/?#]+)'), ''), '(empty)') AS host,
            count(*)::int AS n
       FROM commentary_entries
      WHERE author IN ('Barnes'' Notes', 'Albert Barnes')
      GROUP BY 1, 2 ORDER BY 3 DESC`,
  );
  say(`\n§3 BARNES, BY AUTHOR STRING AND HOST (A3 excluded barnes-notes; A4 left it staged)`);
  for (const r of barnes.rows) say(`  ${String(r.n).padStart(7)}  ${r.author.padEnd(18)} ${r.host}`);
  if (barnes.rows.length === 0) say('  (no rows under either author string)');

  // `sources` has no source_url column — provenance lives in the `provenance` JSONB (006:28).
  const sourcesRows = await c.query<{ slug: string; status: string; author: string; provenance: string }>(
    `SELECT slug, status, author, COALESCE(provenance->>'source_url', provenance->>'url', provenance::text) AS provenance
       FROM sources ORDER BY status, slug`,
  );
  say(`\n§4 sources — the boundary that DOES bind the sections path`);
  for (const r of sourcesRows.rows) {
    say(`  ${r.status.padEnd(10)} ${r.slug.padEnd(24)} ${r.author.padEnd(28)} ${(r.provenance ?? '').slice(0, 90)}`);
  }

  // §5 — THE OTHER SERVING SURFACE: the /ask embeddings pool.
  //
  // LEGAL_CORPUS_FILTER (teacher/routing.ts) gates retrieval for /ask, over `embeddings`, and it
  // is a DIFFERENT predicate over a DIFFERENT table. It already carries the crosswire leg for
  // Barnes/Wesley/Calvin — the leg that was hand-copied into commentary_entries, matched zero rows
  // there and got deleted (H5). But it admits 'John Chrysostom' and 'Augustine of Hippo' BY NAME
  // with no provenance test at all, and routing.ts:28-30 records that those rows carry
  // historicalchristian.faith provenance with "provenance repair to New Advent pending".
  //
  // Measured here rather than fixed, deliberately: excluding them changes what /ask RETRIEVES,
  // which CLAUDE.md gates on re-running the held-out eval and recording the number in WORKLOG.md.
  // The eval needs DEEPINFRA_API_KEY, which is not on this machine. A ratchet you can read beats
  // an unmeasured retrieval change.
  const pool = await c.query<{ author: string; host: string; n: number; forbidden: boolean }>(
    `SELECT metadata->>'author' AS author,
            COALESCE(NULLIF(substring(metadata->>'sourceUrl' from '^(?:[a-z]+://)?([^/?#]+)'), ''), '(empty)') AS host,
            count(*)::int AS n,
            bool_or(EXISTS (SELECT 1 FROM unnest($1::text[]) d
                             WHERE lower(metadata->>'sourceUrl') LIKE '%' || d || '%')) AS forbidden
       FROM embeddings
      WHERE ${LEGAL_CORPUS_FILTER}
      GROUP BY 1, 2
      ORDER BY 3 DESC`,
    [FORBIDDEN_PROVENANCE_DOMAINS],
  );
  say(`\n§5 THE /ask POOL — admitted by LEGAL_CORPUS_FILTER over \`embeddings\``);
  let poolForbidden = 0;
  for (const r of pool.rows) {
    if (r.forbidden) poolForbidden += r.n;
    say(`  ${String(r.n).padStart(7)}  ${(r.author ?? '(null)').padEnd(32)} ${r.host}${r.forbidden ? '   ⛔ FORBIDDEN AGGREGATOR' : ''}`);
  }
  const poolTotal = pool.rows.reduce((n, r) => n + r.n, 0);
  say(`  ${String(poolTotal).padStart(7)}  TOTAL ADMITTED   (${poolForbidden.toLocaleString()} from a forbidden aggregator)`);

  say(`\nVERDICT`);
  say(`  entries admitted by the shipped predicate      : ${servedTotal.toLocaleString()}`);
  say(`  of those, from a forbidden aggregator (H5)     : ${forbiddenServed.toLocaleString()}`);
  const h4 = bySlug.rows.filter((r) => {
    const status = r.work === null ? null : (statusBySlug.get(r.work) ?? null);
    return r.admitted > 0 && status !== null && status !== 'published';
  });
  say(`  admitted while sources.status is not published : ${h4.reduce((n, r) => n + r.admitted, 0).toLocaleString()} across ${h4.length} work(s)`);
  say(`  /ask pool admitted                             : ${poolTotal.toLocaleString()}`);
  say(`  of those, from a forbidden aggregator          : ${poolForbidden.toLocaleString()}   <- OPEN, gated on the held-out eval`);
} finally {
  await c.query('ROLLBACK').catch(() => {});
  await c.end().catch(() => {});
}

if (outArg) {
  writeFileSync(outArg, `${lines.join('\n')}\n`);
  console.log(`\nwritten: ${outArg}`);
}
