// Re-sourcing pipeline step 2 — THE MATCH TEST (docs/RESOURCING_PLAN.md §3).
// A section may only be re-labeled "permitted provenance" if its text ACTUALLY
// matches the permitted source; the matcher is the fail-closed gate that keeps a
// biblehub string from being silently relabeled.
//
// Normalization REUSES the repo's existing pieces — never re-typed:
//   sanitizeForIngest  (src/ingest/content-sanity.ts)  — entity-decode for ingest
//   normalizeForMatch  (src/verifier/normalize.ts)     — the verifier's own fold
//   tokens/classify    (src/ingest/resource-textmatch.ts) — Jaccard + containment
//
// Verdicts (plan §3, threshold decision #1 = ≥0.98 token Jaccard):
//   match     — normalized-equal, or Jaccard ≥ 0.98        → provenance-repair, $0
//   truncated — containment ≥ 0.98 (same text, cut short)  → provenance-repair, $0
//   differ    — anything else                              → replace + re-embed
//
// CLI: the RED-PROOF. A check never watched go RED proves nothing (THE_LOOP rule 4):
//   npx tsx scripts/resourcing/match-test.mts --redproof --evidence-dir=docs/evidence/resourcing
// builds a fixture whose "permitted" text is deliberately corrupted and asserts the
// matcher returns DIFFER — never MATCH. Exits NON-ZERO if any corruption passes.
// Positive controls prove the matcher is not vacuously always-DIFFER.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sanitizeForIngest } from '../../src/ingest/content-sanity.js';
import { normalizeForMatch } from '../../src/verifier/normalize.js';
import { classify, shingleHashSet, tokenList, tokens, type MatchClass } from '../../src/ingest/resource-textmatch.js';

export const MATCH_THRESHOLD = 0.98; // RESOURCING_PLAN §3 / open-decision 1

export type Verdict = MatchClass; // 'match' | 'truncated' | 'differ'

export interface CompareResult {
  verdict: Verdict;
  exact: boolean;          // normalized strings identical
  jaccard: number;         // token-set Jaccard (plan §3 primary test)
  containment: number;     // token inter / min(|a|,|b|) — the truncation signal
  shingleContainment: number | null; // 4-gram inter / min — null when the token test already differed
  orderContainment: number | null;   // token-LCS / min(list len) — null likewise
  guardFired: 'shingle' | 'order' | null; // which guard vetoed a token-level repairable
  threshold: number;
}

/** Longest-common-subsequence length over token arrays (order-sensitive). */
function tokenLcsLength(a: string[], b: string[]): number {
  // DP over the shorter array's width to bound memory.
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let prev = new Array<number>(short.length + 1).fill(0);
  let curr = new Array<number>(short.length + 1).fill(0);
  for (let i = 1; i <= long.length; i++) {
    const li = long[i - 1]!;
    for (let j = 1; j <= short.length; j++) {
      curr[j] = li === short[j - 1]! ? prev[j - 1]! + 1 : Math.max(prev[j]!, curr[j - 1]!);
    }
    [prev, curr] = [curr, prev.fill(0)];
  }
  return prev[short.length]!;
}

/** The one comparator every re-source adapter goes through. Both sides are
 *  normalized with the ingest sanitizer + the verifier's fold before the
 *  token test — the same normalization the verifier already trusts.
 *
 *  Token Jaccard/containment are SET tests: they cannot see word order, and
 *  4-gram containment alone cannot see a single cut-and-swap (only the seam
 *  shingles break — measured RED at 0.986 on the red-proof's half-swap). So a
 *  token-level match/truncated only STANDS if TWO order-sensitive guards also
 *  clear the threshold: 4-gram shingle containment (catches scattered drops/
 *  substitutions) and token-LCS containment (catches reordering). Either guard
 *  can only DOWNGRADE repairable → differ, never the reverse — fail-closed. */
export function compareTexts(stored: string, permitted: string, threshold = MATCH_THRESHOLD): CompareResult {
  const a = normalizeForMatch(sanitizeForIngest(stored));
  const b = normalizeForMatch(sanitizeForIngest(permitted));
  if (a === b) {
    return { verdict: 'match', exact: true, jaccard: 1, containment: 1, shingleContainment: 1, orderContainment: 1, guardFired: null, threshold };
  }
  const ta = tokens(a);
  const tb = tokens(b);
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  const union = ta.size + tb.size - inter || 1;
  const jaccard = inter / union;
  const containment = inter / Math.max(1, Math.min(ta.size, tb.size));
  let verdict = classify(ta, tb, threshold);
  let shingleContainment: number | null = null; // null = guard not needed (token test already differ)
  let orderContainment: number | null = null;
  let guardFired: CompareResult['guardFired'] = null;
  if (verdict !== 'differ') {
    const sa = shingleHashSet(a);
    const sb = shingleHashSet(b);
    if (sa.size === 0 || sb.size === 0) {
      shingleContainment = 1; // too short to shingle (<4 tokens) — token test only
    } else {
      let sInter = 0;
      for (const x of sa) if (sb.has(x)) sInter++;
      shingleContainment = sInter / Math.max(1, Math.min(sa.size, sb.size));
    }
    if (shingleContainment < threshold) {
      verdict = 'differ';
      guardFired = 'shingle';
    } else {
      // LCS runs over token LISTS (duplicates count — order is the point); the
      // denominator must be the list lengths, not the set cardinalities.
      const la = tokenList(a);
      const lb = tokenList(b);
      orderContainment = tokenLcsLength(la, lb) / Math.max(1, Math.min(la.length, lb.length));
      if (orderContainment < threshold) {
        verdict = 'differ';
        guardFired = 'order';
      }
    }
  }
  return { verdict, exact: false, jaccard, containment, shingleContainment, orderContainment, guardFired, threshold };
}

/** $0-repair = the vector stays: the stored text is the same PD text (possibly
 *  cut short). Only 'differ' reopens the embedding. */
export const isRepairable = (r: CompareResult): boolean => r.verdict === 'match' || r.verdict === 'truncated';

// ── red-proof fixture ────────────────────────────────────────────────────────
// A genuine Barnes NT Notes passage (Matthew 1:1 area — PD, d. 1870) as the
// baseline, plus deliberate corruptions of it standing in as the "permitted"
// text. Every corruption must classify DIFFER against the stored original.
const GENUINE =
  'The book of the generation - This is the proper title of the chapter. It is the same as to say, ' +
  '"the account of the ancestry or family, or the genealogical table of Jesus Christ." The phrase is ' +
  'common in Jewish writings. Compare Genesis 5:1. "This is the book of the generations of Adam," ' +
  'that is, the genealogical table of the family or descendants of Adam. See also Genesis 6:9. The Jews, ' +
  'moreover, as we do, kept such tables of their own families, and it is probable that this was copied ' +
  'from the record of the family of Joseph. Jesus - See the notes at Matthew 1:21. Christ - The word ' +
  '"Christ" is a Greek word, signifying "anointed." The Hebrew word signifying the same thing is "Messiah." ' +
  'Hence, Jesus is called either the Messiah or the Christ, meaning the same thing. The Jews speak of the ' +
  'Messiah; Christians speak of him as the Christ. In ancient times, when kings and priests were set apart ' +
  'to their office, they were anointed with oil. To anoint, therefore, means often the same as to consecrate, ' +
  'or to set apart to an office. Hence, those thus set apart are said to be anointed, or to be the anointed ' +
  'of God. It is for this reason that the name is given to the Lord Jesus.';

function corruptDropWords(s: string): string {
  return s.split(' ').filter((_, i) => i % 12 !== 5).join(' ');
}
function corruptSwapWords(s: string): string {
  return s.split(' ').map((w, i) => (i % 9 === 4 ? 'zzzxqq' : w)).join(' ');
}
function corruptShuffle(s: string): string {
  const words = s.split(' ');
  const half = Math.floor(words.length / 2);
  return [...words.slice(half), ...words.slice(0, half)].join(' ');
}
function corruptDifferentEdition(): string {
  // A genuinely different commentary voice on the same verse (Wesley-style) —
  // the "wrong edition" case the whole gate exists to catch.
  return (
    'The book of the generation of Jesus Christ - So St. Matthew begins his Gospel, ' +
    'giving us the pedigree of our Lord, not to gratify curiosity, but to prove that he ' +
    'is the son of Abraham and of David, in whom all the promises were to be fulfilled. ' +
    'The Jews were exact in preserving their genealogies, and none more so than that of ' +
    'the expected Messiah. This register answers to that of Luke, though they differ in ' +
    'many particulars, Matthew giving the legal line through Joseph, and Luke the natural ' +
    'line through Mary, as the ancients generally reconcile them.'
  );
}

interface FixtureCase { name: string; stored: string; permitted: string; expect: Verdict | Verdict[] }

function buildFixture(): FixtureCase[] {
  return [
    // positive controls — prove the matcher CAN say match (not vacuously differ)
    { name: 'control:identical', stored: GENUINE, permitted: GENUINE, expect: 'match' },
    {
      name: 'control:typography-only', // case/punct/whitespace/entity noise must not fail a real match
      stored: GENUINE,
      permitted: GENUINE.replace(/Christ/g, 'christ').replace(/\. /g, '.\n\n').replace(/"the/g, '&#8220;the'),
      expect: 'match',
    },
    {
      name: 'control:truncated-copy', // same text cut short — the helloao precedent, still $0-repair
      stored: GENUINE.split(' ').slice(0, 40).join(' '),
      permitted: GENUINE,
      expect: ['match', 'truncated'],
    },
    // RED cases — corrupted "permitted" text must NEVER be a match
    { name: 'RED:drop-every-12th-word', stored: GENUINE, permitted: corruptDropWords(GENUINE), expect: 'differ' },
    { name: 'RED:substitute-every-9th-word', stored: GENUINE, permitted: corruptSwapWords(GENUINE), expect: 'differ' },
    { name: 'RED:paragraph-shuffle', stored: GENUINE, permitted: corruptShuffle(GENUINE), expect: 'differ' },
    { name: 'RED:different-edition', stored: GENUINE, permitted: corruptDifferentEdition(), expect: 'differ' },
    { name: 'RED:empty-permitted', stored: GENUINE, permitted: '', expect: 'differ' },
  ];
}

function runRedProof(evidenceDir: string): void {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const fixture = buildFixture();
  const results = fixture.map((c) => {
    const r = compareTexts(c.stored, c.permitted);
    const expects = Array.isArray(c.expect) ? c.expect : [c.expect];
    const pass = expects.includes(r.verdict);
    return { name: c.name, expect: c.expect, got: r.verdict, exact: r.exact,
             jaccard: +r.jaccard.toFixed(4), containment: +r.containment.toFixed(4),
             shingleContainment: r.shingleContainment === null ? null : +r.shingleContainment.toFixed(4),
             orderContainment: r.orderContainment === null ? null : +r.orderContainment.toFixed(4),
             guardFired: r.guardFired, pass };
  });
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  expect=${JSON.stringify(r.expect)} got=${r.got} (jaccard=${r.jaccard} containment=${r.containment} shingle=${r.shingleContainment ?? '-'} order=${r.orderContainment ?? '-'}${r.guardFired ? ` guard=${r.guardFired}` : ''})`);
  }
  const red = results.filter((r) => r.name.startsWith('RED:'));
  const controls = results.filter((r) => !r.name.startsWith('RED:'));
  const redOk = red.every((r) => r.got === 'differ');
  const controlsOk = controls.every((r) => r.pass);
  console.log(`red-proof: ${redOk ? 'SOUND' : '*** UNSOUND ***'} — ${red.length}/${red.length} corruptions classified differ: ${redOk}`);
  console.log(`controls:  ${controlsOk ? 'OK' : '*** BROKEN ***'} — matcher still recognizes genuine matches`);
  mkdirSync(evidenceDir, { recursive: true });
  const fixturePath = path.join(evidenceDir, `match-redproof-fixture-${ts}.json`);
  const resultPath = path.join(evidenceDir, `match-redproof-result-${ts}.json`);
  writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n');
  writeFileSync(resultPath, JSON.stringify({ threshold: MATCH_THRESHOLD, redOk, controlsOk, results }, null, 2) + '\n');
  console.log(`evidence: ${fixturePath}`);
  console.log(`evidence: ${resultPath}`);
  if (!redOk || !controlsOk) process.exit(1);
}

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

if (process.argv.includes('--redproof')) {
  runRedProof(arg('--evidence-dir') ?? 'docs/evidence/resourcing');
} else if (process.argv[1] && /match-test/.test(process.argv[1])) {
  console.error('usage: match-test.mts --redproof [--evidence-dir=docs/evidence/resourcing]  (library: compareTexts)');
  process.exit(2);
}
