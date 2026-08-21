// T1§4 — the license gate is BLIND to UGC by construction. Two content classes, opposite
// handling: corpus (user_id IS NULL, static files under web/public/) is block-by-default and
// gated here; user-generated content (user_id IS NOT NULL: uploads in Vercel Blob, rows in
// user tables) is out of scope — the gate must never read a user table or blob. This proves it.
//
// The isolation leg (test 3) was rebuilt per the 2026-08-20 uploader deep dive, finding D7:
// the old version read ONLY routing.ts and asserted `>= 3` predicates against an actual 7 —
// four builders could drop the filter with the test green, and the six OTHER files reading the
// mixed `embeddings` table were never looked at. Now the FILE SET IS DERIVED at test time
// (every web/src file containing `FROM embeddings`) and the check runs PER SQL STATEMENT, not
// per file — a per-file presence check is fooled by a file where one statement carries the
// predicate and another does not (which is exactly studies.ts today, finding D8).
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockedBibleTranslations } from '../helpers/corpus-scan';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const gateSource = () =>
  readFileSync(path.join(REPO, 'scripts/predeploy-gate.ts'), 'utf8') +
  readFileSync(path.join(REPO, 'web/test/helpers/corpus-scan.ts'), 'utf8') +
  readFileSync(path.join(REPO, 'web/src/lib/licensing.ts'), 'utf8');

// ---------------------------------------------------------------------------------------------
// Statement-level machinery for test 3. Pure functions over source text, so the "can this
// checker fail" legs below exercise them directly on synthetic fixtures (a red-proof that runs
// every CI pass, without seeding a defect into shipped files).

/** Backtick template literals (none of the SQL files nest backticks inside interpolations —
 *  the coverage weld below fails loud if that ever changes, rather than silently mis-pairing). */
const templateLiterals = (src: string): string[] => src.match(/`[^`]*`/g) ?? [];

const countOccurrences = (s: string, needle: string): number => s.split(needle).length - 1;

/** The SQL statements in `src` that read the mixed embeddings table. */
const embeddingsStatements = (src: string): string[] =>
  templateLiterals(src).filter((t) => t.includes('FROM embeddings'));

/** Statements reading embeddings WITHOUT the corpus-only predicate — each is a potential
 *  serve-a-user-row-as-corpus hole. */
const deficientStatements = (src: string): string[] =>
  embeddingsStatements(src).filter((t) => !t.includes('user_id IS NULL'));

/** COVERAGE WELD: every `FROM embeddings` in the file must sit inside an extracted literal.
 *  If a occurrence lives outside (string concat, a comment, or broken backtick pairing), the
 *  statement check above cannot see it — so that state fails the test rather than narrowing it. */
const extractionCovers = (src: string): boolean =>
  countOccurrences(src, 'FROM embeddings') ===
  embeddingsStatements(src).reduce((n, t) => n + countOccurrences(t, 'FROM embeddings'), 0);

/** Derive every web/src file that reads the mixed table. web/src ONLY, deliberately: it is the
 *  serving surface, running as app_runtime on the request path — the blindness this gate is
 *  about. Root src/ also matches 19 files, all ingest/ops tooling that runs as neondb_owner off
 *  the request path and WRITES the corpus; those are governed by the ingest gates, not this one. */
const embeddingsReaders = (): string[] => {
  const root = path.join(REPO, 'web/src');
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && readFileSync(p, 'utf8').includes('FROM embeddings')) hits.push(p);
    }
  };
  walk(root);
  return hits.sort();
};

// The ONLY tolerated deficient statement, pinned to its file and to an EXACT count of 1.
// studies.ts probeClipFailure: a servability PROBE run after a clip insert already failed the
// full predicate — it returns the reason code 'source_not_found' vs 'not_servable' and never
// returns row content. That is finding D8 (open): disclosure is thin but it is not a serving
// path. When D8 is fixed, the === 1 leg below goes red and this entry gets DELETED — and if it
// ever reads 2, a NEW predicate-less read landed, which is a new defect, not a reason to bump
// the number.
const KNOWN_DEFICIENT: Record<string, number> = {
  'web/src/lib/studies.ts': 1,
};

describe('T1§4 — the license gate is blind to UGC', () => {
  it('no gate module imports the DB handle or a blob store, or calls runAsUser/getDb', () => {
    const src = gateSource();
    // CODE couplings to user data (not comments): a db/blob import, or a runtime user-data call.
    const forbidden = [
      /from ['"][^'"]*\/lib\/db['"]/, // getDb / runAsUser handle
      /@vercel\/blob/, // user upload blob store
      /\brunAsUser\s*\(/,
      /\bgetDb\s*\(/,
      /from ['"][^'"]*\/lib\/chat['"]/,
      /from ['"][^'"]*\/lib\/annotations['"]/,
    ];
    const hits = forbidden.filter((re) => re.test(src)).map((re) => re.source);
    expect(hits, `gate reads user data (defect): ${hits.join(', ')}`).toEqual([]);
  });

  it('everything in a scanned location is treated as CORPUS — a UGC-looking dir is not read as user data, it is license-checked', () => {
    // Seed a "user upload" directory into the bible scan location. The gate does not have a
    // UGC code path: it classifies it as a corpus work with no license record → BLOCKED. It
    // never reads it as user content. (The scan location is structurally corpus-only.)
    const d = mkdtempSync(path.join(tmpdir(), 'ugc-'));
    mkdirSync(path.join(d, 'web')); // a real allow-listed corpus work
    mkdirSync(path.join(d, 'user-upload-abc123')); // a UGC-looking intruder
    const blocked = blockedBibleTranslations(d).map((b) => b.id);
    rmSync(d, { recursive: true, force: true });
    expect(blocked, 'a UGC-looking dir is license-checked as corpus (blocked), never read as user data').toEqual([
      'user-upload-abc123',
    ]);
  });

  it('isolation: EVERY web/src SQL statement reading embeddings filters user_id IS NULL (derived file set, per statement)', () => {
    const files = embeddingsReaders();
    const rel = (p: string) => path.relative(REPO, p);

    // Derivation tripwire: if the walk/grep is broken, it must fail HERE, not pass over an
    // empty set. routing.ts is the load-bearing serving module and must always derive.
    expect(files.map(rel), 'derivation broke — routing.ts did not derive').toContain(
      path.join('web/src/lib/teacher/routing.ts'),
    );

    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // The weld first: a FROM embeddings the extractor cannot see must fail the test.
      expect(
        extractionCovers(src),
        `${rel(f)}: a 'FROM embeddings' sits outside an extractable template literal ` +
          `(string concat, comment, or nested backticks) — this test cannot check it; ` +
          `restructure the statement or extend the extractor CONSCIOUSLY`,
      ).toBe(true);

      const allowed = KNOWN_DEFICIENT[rel(f).split(path.sep).join('/')] ?? 0;
      const bad = deficientStatements(src);
      expect(
        bad.length,
        `${rel(f)}: ${bad.length} embeddings statement(s) missing 'user_id IS NULL' ` +
          `(allowed here: ${allowed}). A user row served as corpus is the breach this gate ` +
          `exists to prevent. Offending statement(s):\n${bad.join('\n---\n')}`,
      ).toBe(allowed);
    }
  });

  it('isolation: routing.ts carries EXACTLY 7 user_id IS NULL predicates (moves consciously, never silently)', () => {
    const routing = readFileSync(path.join(REPO, 'web/src/lib/teacher/routing.ts'), 'utf8');
    // 7 = the file's 7 FROM embeddings builders (base pool, verse inject ×2, song-verse ×2,
    // lane ×2), each carrying the predicate — counted 2026-08-21. The old `>= 3` let four
    // builders drop the filter silently (finding D7). If this number changes, a builder was
    // added or removed: re-derive, confirm every builder still filters, then move the pin.
    const count = (routing.match(/user_id IS NULL/g) ?? []).length;
    expect(count, 'routing.ts predicate count moved — re-verify every builder, then move this pin').toBe(7);
  });

  it("the statement checker CAN fail (red-proof fixtures — the shapes it exists to catch)", () => {
    const missing = 'const q = sql`SELECT id FROM embeddings WHERE served LIMIT 1`;';
    const present = 'const q = sql`SELECT id FROM embeddings WHERE user_id IS NULL AND served`;';
    const outside = "const q = 'SELECT id FROM embeddings WHERE served';"; // not a template literal
    expect(deficientStatements(missing), 'a predicate-less statement must be flagged').toHaveLength(1);
    expect(deficientStatements(present), 'a filtered statement must pass').toHaveLength(0);
    // per-file blindness (the D8 shape): predicate in ONE statement must not excuse another
    expect(deficientStatements(present + missing), 'one filtered statement must not excuse a bare one').toHaveLength(1);
    expect(extractionCovers(outside), 'a read the extractor cannot see must trip the weld').toBe(false);
    expect(extractionCovers(present + missing), 'well-formed literals satisfy the weld').toBe(true);
  });
});
