// ADR-029 remediation, round 2: remove NON-AUTHORIAL MATTER carried into published works.
//
//   NEON_BRANCH=dev npx tsx src/ingest/suppress-nonauthorial-matter.ts [--apply]
//
// THE CLASS (ADR-029, widened by the ship committee). ADR-029 framed the defect as
// "composite-volume misattribution" and the sweep that followed looked only at CCEL works.
// That was too narrow twice over:
//   * the SOURCING was wrong — tennyson/traherne are Gutenberg, never swept, and fail on
//     their heads/tails exactly the way the CCEL method would have caught;
//   * the SHAPE was wrong — it is not only "another author's work". It is ANY non-authorial
//     matter bound in with the text: another father's epistles (Origen), an editor's prologue
//     (Chrysostom/Schaff), a publisher's price list (Tennyson, Traherne, Spurgeon), and
//     machine-generated word indexes (929 rows). A detector written against "different
//     author" misses three of the four.
//
// EVERY TARGET BELOW WAS VERIFIED BY READING ITS BODY, not by trusting a heading. Two
// reported ranges were WRONG and are corrected here:
//   * traherne-poems: the ads run 413-417 (Charles Lamb, James Thomson, Oliver Goldsmith —
//     all under Traherne's name), not 417 alone.
//   * spurgeon-talks-to-farmers: 298 is a MIXED chunk — it opens with real Spurgeon ("Is the
//     eternal happiness of the righteous…") and ends inside another book's preface. It is
//     therefore NOT deleted; deleting it would destroy sermon text. Flagged for a re-slice.
//
// DELIBERATELY KEPT (verified real content, do not "clean" these):
//   * schaff-creeds "Comparative Table of the Ante-Nicene Rules of Faith" (7) — genuine
//     scholarship; comparing creeds IS the book's subject, and the body is creed text.
//   * calvin-institutes "General Index of Chapters" (6) — a legible table of contents.
//
// RIGOR CHECK. The frozen v4 held-out eval measures the EXEGETICAL pool (legalBasePool →
// LEGAL_CORPUS_FILTER → SERVED_PROSE_WORKS = keil-delitzsch, catena-aurea,
// chrysostom-homilies, augustine-homilies). Verified at runtime below: every work touched
// here EXCEPT chrysostom-homilies is outside that pool, so v4 cannot reach those rows by
// construction and no re-measure is owed for them. chrysostom's 6 rows ARE in the pool and
// are re-checked by scripts/../check-prolegomena-reachability.mts's method before deletion.
// NOTE the honest limit: the lanes (sermon/theology/song-verse) have their own retrieval and
// are NOT covered by any frozen eval, so "v4 is unaffected" is a narrower claim than "no
// retrieval effect".
//
// Discipline (same as suppress-chrysostom-prolegomena): dev-guard, dry-run default, back up
// every row WITH VECTORS before deleting, verify inside the txn, roll back on any failure.

import pg from 'pg';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const BACKUP = 'docs/evidence/part2/nonauthorial-matter-suppressed.jsonl';

/** The exegetical pool (routing.ts SERVED_PROSE_WORKS) — the only lane the frozen v4 eval measures. */
const EXEGETICAL_WORKS = ['keil-delitzsch', 'catena-aurea', 'chrysostom-homilies', 'augustine-homilies'];

interface Target {
  slug: string;
  /** Heading regex (POSIX, case-insensitive) OR an explicit inclusive ordinal range. */
  headingRe?: string;
  ordinals?: [number, number];
  expect: number;
  why: string;
}

const TARGETS: Target[] = [
  // ── machine-generated word/phrase indexes: alphabetical lists with page-number refs.
  //    Body-verified in every work: "Influxu Spiritus\nIsta a Domino facta sunt\n…" / ":\n1\n2\n3".
  { slug: 'schaff-creeds', headingRe: '(Latin|German|French) Words and Phrases', expect: 585, why: 'word index' },
  { slug: 'hodge-systematic', headingRe: '(Latin|German|French) Words and Phrases', expect: 283, why: 'word index' },
  { slug: 'owen-works', headingRe: 'Latin Words and Phrases', expect: 41, why: 'word index' },
  { slug: 'watson-works', headingRe: 'Latin Words and Phrases', expect: 17, why: 'word index' },
  { slug: 'maclaren-expositions', headingRe: 'Latin Words and Phrases', expect: 2, why: 'word index' },
  { slug: 'edwards-works', headingRe: 'Latin Words and Phrases', expect: 1, why: 'word index' },
  // ── editor's edition-concordance (page ranges across two printings), not Chrysostom.
  { slug: 'chrysostom-homilies', headingRe: 'Comparative Table of the Works', expect: 6, why: 'edition concordance' },
  // ── publisher's catalogue / price lists, stamped with the poet's name.
  { slug: 'tennyson-in-memoriam', ordinals: [1, 5], expect: 5, why: "bookseller's catalogue" },
  { slug: 'traherne-poems', ordinals: [413, 417], expect: 5, why: "publisher's catalogue" },
  { slug: 'spurgeon-talks-to-farmers', ordinals: [299, 300], expect: 2, why: "publisher's back-matter" },
];

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

function where(t: Target): { sql: string; params: unknown[] } {
  return t.ordinals
    ? { sql: 'sec.ordinal BETWEEN $2 AND $3', params: [t.ordinals[0], t.ordinals[1]] }
    : { sql: 'sec.heading ~* $2', params: [t.headingRe] };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('owner DATABASE_URL is required');
  const fromEnv = Boolean(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
  const branch = fromEnv ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH');
  if (branch !== 'dev' && branch !== 'test') throw new Error(`STOP: NEON_BRANCH="${branch ?? '(unset)'}" must be dev|test`);
  const host = new URL(dbUrl.replace(/^"|"$/g, '')).host;
  if (!host.includes('ep-tiny-hat')) throw new Error(`STOP: host "${host}" is not dev (expected ep-tiny-hat)`);
  console.log(`db host: ${host} (credentials redacted)\n`);

  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    let total = 0;
    const plan: Array<{ t: Target; ids: string[]; inExegetical: boolean }> = [];

    for (const t of TARGETS) {
      const w = where(t);
      const { rows } = await client.query<{ id: string; ordinal: number; heading: string | null; body: string }>(
        `SELECT sec.id, sec.ordinal, sec.heading, sec.body
           FROM sections sec JOIN sources s ON s.id = sec.source_id
          WHERE s.slug = $1 AND ${w.sql} ORDER BY sec.ordinal`,
        [t.slug, ...w.params],
      );
      if (rows.length !== t.expect) {
        throw new Error(`STOP: ${t.slug} matched ${rows.length} sections, expected ${t.expect} — the target moved; re-verify before deleting`);
      }
      const inExegetical = EXEGETICAL_WORKS.includes(t.slug);
      plan.push({ t, ids: rows.map((r) => r.id), inExegetical });
      total += rows.length;
      console.log(`  ${t.slug.padEnd(26)} ${String(rows.length).padStart(4)}  ${t.why}${inExegetical ? '   [IN EXEGETICAL POOL — v4-relevant]' : ''}`);
      console.log(`      e.g. §${rows[0]!.ordinal} ${JSON.stringify(rows[0]!.body.slice(0, 90))}`);
    }
    console.log(`\n  TOTAL sections to remove: ${total}`);

    const exegeticalHits = plan.filter((p) => p.inExegetical).reduce((n, p) => n + p.ids.length, 0);
    console.log(`  of which inside the frozen-v4 exegetical pool: ${exegeticalHits}`
      + (exegeticalHits === 0 ? '  → v4 cannot reach any of these; no re-measure owed' : '  → v4-relevant, re-check reachability'));

    if (!apply) {
      console.log('\nDRY RUN — nothing written. Re-run with --apply.');
      return;
    }

    // BACK UP (sections + any matching flat embeddings, vectors included).
    mkdirSync('docs/evidence/part2', { recursive: true });
    const backup: unknown[] = [];
    for (const { t, ids } of plan) {
      const { rows } = await client.query(
        `SELECT s.slug, sec.id, sec.ordinal, sec.unit_ordinal, sec.heading, sec.body,
                se.model_slug, se.embedding::text AS embedding
           FROM sections sec JOIN sources s ON s.id = sec.source_id
           LEFT JOIN section_embeddings se ON se.section_id = sec.id
          WHERE sec.id = ANY($1::bigint[]) ORDER BY sec.ordinal`,
        [ids],
      );
      for (const r of rows) backup.push({ target: t.why, ...(r as object) });
    }
    writeFileSync(BACKUP, backup.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`\n✓ backed up ${backup.length} rows (with vectors) → ${BACKUP}`);

    await client.query('BEGIN');
    let secDel = 0;
    let embDel = 0;
    for (const { t, ids } of plan) {
      await client.query(`DELETE FROM section_embeddings WHERE section_id = ANY($1::bigint[])`, [ids]);
      const { rowCount } = await client.query(`DELETE FROM sections WHERE id = ANY($1::bigint[])`, [ids]);
      secDel += rowCount ?? 0;

      // The SERVED flat store must be cleaned too, or the rows vanish from the Book Reader
      // while staying fully retrievable by /ask — the worst of both (invisible AND quotable).
      // It has no sections.id, so each target is re-expressed against the flat row's own keys:
      // ordinal targets by the writer's source section number, heading targets by the SAME
      // heading regex (verified present on the flat rows: schaff 585, owen 41, chrysostom 6).
      const { rowCount: e } = t.ordinals
        ? await client.query(
            `DELETE FROM embeddings
              WHERE user_id IS NULL AND metadata->>'work' = $1
                AND split_part(split_part(source_id,':',3),'.',1)::int BETWEEN $2 AND $3`,
            [t.slug, t.ordinals[0], t.ordinals[1]],
          )
        : await client.query(
            `DELETE FROM embeddings
              WHERE user_id IS NULL AND metadata->>'work' = $1 AND metadata->>'heading' ~* $2`,
            [t.slug, t.headingRe],
          );
      embDel += e ?? 0;
    }
    console.log(`  sections deleted: ${secDel}   flat embeddings deleted: ${embDel}`);

    // VERIFY inside the txn.
    for (const { t } of plan) {
      const w = where(t);
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*) n FROM sections sec JOIN sources s ON s.id = sec.source_id
          WHERE s.slug = $1 AND ${w.sql}`,
        [t.slug, ...w.params],
      );
      if (Number(rows[0]!.n) !== 0) throw new Error(`VERIFY FAILED: ${t.slug} still has ${rows[0]!.n} target sections`);
    }
    if (secDel !== total) throw new Error(`VERIFY FAILED: deleted ${secDel}, planned ${total}`);

    await client.query('COMMIT');
    console.log(`\n✓ SUPPRESSED ${secDel} non-authorial sections across ${plan.length} works. Restore: ${BACKUP}`);
    console.log('  NOT the durable repair — the ingest adapters still carry publisher/editor');
    console.log('  matter into a work with no per-work attribution boundary (ADR-029).');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
