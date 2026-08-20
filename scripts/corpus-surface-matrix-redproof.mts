// P0 RED-PROOF for the corpus×surface matrix. The instrument is not trusted until it independently
// re-finds the two defects that motivated it — from a clean run, with each one seeded back in.
//
// It drives `detect()` ITSELF, not a copy: a red-proof that re-implements the detection proves the
// re-implementation works. Seeds are applied inside a transaction that is ALWAYS rolled back, so
// the target is left exactly as found.
//
// Runs against DEV by design. Seeding a defect on production to prove a detector works would mean
// re-breaking the thing we just fixed, on the live site, to make a point.
import pg from 'pg';
process.env.MATRIX_AS_MODULE = '1';
const { detect } = await import('./corpus-surface-matrix.mts');
type Cell = { slug: string; code: string; detail: string };

const url = (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
const endpoint = process.env.MATRIX_TARGET_ENDPOINT;
if (!url || !endpoint) { console.error('DATABASE_URL and MATRIX_TARGET_ENDPOINT required'); process.exit(1); }
if (url.includes('ep-odd-fog')) { console.error('STOP: the red-proof seeds defects; it must NOT run against production'); process.exit(2); }

const c = new pg.Client({ connectionString: url });
await c.connect();
let failures = 0;
const check = (name: string, got: boolean) => {
  console.log(`  ${got ? '✓' : '✗'} ${name}`);
  if (!got) failures++;
};

try {
  await c.query("SET statement_timeout = '600s'");

  const hortServedBefore = (await c.query(
    `SELECT count(*)::int n FROM embeddings WHERE metadata->>'work'='hort-james1909' AND served`)).rows[0].n;

  console.log('\n— baseline (no seeds) —');
  const base = await detect(c);
  console.log(`  findings: ${base.findings.length} ${JSON.stringify(base.byCode)}`);

  // ── SEED 1: Hort, proved in BOTH directions. ──────────────────────────────────────────────
  // The first version asserted Hort was ABSENT from the baseline and then seeded him in. It failed,
  // and the ASSERTION was wrong, not the instrument: dev was never quarantined (only production
  // was), so Hort genuinely serves as poetry here and the baseline is CORRECT to report him. That
  // is the RED, occurring naturally. Seeding the FIX must then clear it — the GREEN, and the half
  // that separates a working detector from one that always reports a problem.
  const hortFound = (m: { findings: Cell[] }) =>
    m.findings.some((f) => f.slug === 'hort-james1909' && (f.code.startsWith('MISPLACED') || f.code === 'SUSPECT-REGISTER'));
  check('SEED 1 RED — dev still serves Hort as poetry, and the baseline catches it', hortFound(base));

  await c.query('BEGIN');
  await c.query(`UPDATE embeddings SET served=false WHERE metadata->>'work'='hort-james1909'`);
  await c.query(`UPDATE sources SET status='staged' WHERE slug='hort-james1909'`);
  const seeded1 = await detect(c);
  await c.query('ROLLBACK');
  check('SEED 1 GREEN — applying the production fix clears it, so the check tracks the data', !hortFound(seeded1));

  // ── SEED 2: the Song, proved in BOTH directions. ──────────────────────────────────────────
  // Dev has never been materialized (0 book-22 entries), so the defect is NATURALLY present here
  // and the baseline must already report it — that is the RED. Then inserting a single admitted
  // row must clear it, which is the GREEN. One-sided proofs are how "always reports a problem"
  // passes for a working detector.
  const b22 = (s: string) => s !== 'NONE' && s.split(',').map((x) => x.trim()).includes('22');
  check('SEED 2 RED — dev has no Song entries, and the baseline reports book 22 unreachable', b22(base.emptyBooks));

  await c.query('BEGIN');
  await c.query(
    `INSERT INTO commentary_entries (book, chapter, verse_start, verse_end, author, year, tradition,
                                     source_title, source_url, body, entry_index)
     VALUES (22, 1, 1, 1, 'John Gill', 1763, 'Reformed Baptist', 'seed', '', 'seeded body', 0)`);
  const seeded2 = await detect(c);
  await c.query('ROLLBACK');
  check('SEED 2 GREEN — one admitted row clears it, so the check tracks the data', !b22(seeded2.emptyBooks));

  // ── ANTI-VACUITY: the detector must be capable of returning a clean cell ──────────────────
  check('the baseline actually measured works (not an empty scan)', base.works > 100);
  check('rollback left the target as found — Hort serves on dev exactly as before the seed',
        (await c.query(`SELECT count(*)::int n FROM embeddings WHERE metadata->>'work'='hort-james1909' AND served`)).rows[0].n === hortServedBefore);
  check('rollback left the target as found — the seeded Song row is gone',
        (await c.query(`SELECT count(*)::int n FROM commentary_entries WHERE author='John Gill' AND book=22`)).rows[0].n === 0);

  console.log(failures === 0 ? '\n  P0 PASSED — the instrument catches both known defects.' : `\n  P0 FAILED — ${failures} check(s)`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally { await c.end(); }
