// FORMAT-AGNOSTIC audit of the MUST_NOT_SERVE ruling. Additive: nothing here is a query filter
// and nothing here feeds an index predicate.
//
// WHY THIS EXISTS. On 2026-08-18 the veto was wired to the commentary_entries FTS surface
// (migrations 117/118). It names authors in the format THAT table uses — `GK Chesterton`. The
// `sources` table writes them surname-first — `Chesterton, Gilbert Keith` — and
// `isMustNotServeAuthor()` returns FALSE for that string. So a work by a vetoed author sat
// PUBLISHED and SERVING on production (`chesterton-preexistence`, 25 rows) while a veto existed
// that could not see it. It was found by accident, eight hours later, while preparing an unrelated
// batch. Nothing would have caught it.
//
// WHY NOT JUST WIDEN MUST_NOT_SERVE_AUTHORS. Two reasons, both hard:
//   1. `mustNotServeVetoSql()`'s default rendering IS the live partial-index predicate on
//      `idx_commentary_fts_legal`. Adding a name changes the SQL the app sends without changing
//      the index it was built against, so the planner stops using it — a silent seq scan on a
//      19 GB table. Widening it is a MIGRATION, not an edit.
//   2. ADR-112 (owner ruling, 2026-08-18) made Chesterton **per-work**: published before 1931 may
//      be used, 1931-or-later and undated may not. An author-level veto cannot express that.
//
// So this module does the thing the veto cannot: it flags, for HUMAN review, any served work whose
// author LOOKS like a vetoed name in any format. Deliberately loose. A false positive costs someone
// thirty seconds; a false negative is what happened above.
import { MUST_NOT_SERVE_AUTHORS } from './legal-corpus';

/** Distinctive name-tokens for each MUST_NOT_SERVE entry.
 *
 *  Curated, NOT derived by splitting — the last token of "Tyndale Study Notes" is "Notes" and of
 *  "Origen of Alexandria" is "Alexandria", so mechanical derivation produces both misses and
 *  absurd false positives. It is kept honest by `every-veto-name-has-a-surname` below, which fails
 *  if a name is added to MUST_NOT_SERVE_AUTHORS without a token here. That test is what stops this
 *  becoming another hand-maintained set nobody enforces. */
export const MUST_NOT_SERVE_SURNAMES: readonly string[] = [
  'tyndale', 'theophylact', 'bonaventure', 'oecumenius', 'origen',
  'larcher', 'lewis', 'chesterton', 'wilson', 'tolkien', 'jerome',
];

/** Works whose author is on MUST_NOT_SERVE_AUTHORS but which an owner ruling admits anyway.
 *
 *  ADR-112, 2026-08-18: "GK works published prior to 1931 we use, everything else we don't use."
 *  Value = first-publication year. Sources: the manifest's `provenance.year` where
 *  `year_basis === 'printSourceInfo'`; otherwise the published G. K. Chesterton bibliography,
 *  because the manifest records his 1936 DEATH year as a placeholder for 13 of 25 works, the CCEL
 *  pages state no date, and ingest strips front matter. See ADR-112 for the full method. */
export const MUST_NOT_SERVE_WORK_EXCEPTIONS: Readonly<Record<string, number>> = {
  'chesterton-america': 1922,
  'chesterton-ball-cross': 1909,
  'chesterton-defendant': 1902,
  'chesterton-divorce': 1920,
  'chesterton-eugenics': 1922,
  'chesterton-everlasting': 1925,
  'chesterton-heretics': 1905,
  'chesterton-innocencebrown': 1911,
  'chesterton-longbow': 1925,
  'chesterton-magic': 1913,
  'chesterton-manalive': 1912,
  'chesterton-napoleon': 1904,
  'chesterton-orthodoxy': 1908,
  'chesterton-thingsconsidered': 1908,
  'chesterton-thursday': 1908,
  'chesterton-toomuch': 1922,
  'chesterton-trifles': 1909,
  'chesterton-victorianage': 1913,
  'chesterton-whatwrong': 1910,
  'chesterton-whitehorse': 1911,
  'chesterton-wisdom': 1914,
};

/** ADR-112's cutoff. A work published in this year or later is NOT admitted. */
export const ADR112_CUTOFF_YEAR = 1931;

/** Surname-rule hits a human has reviewed and cleared, keyed by the exact author string, value
 *  = who this actually is and why they are not the vetoed name. The ONLY way out of a surname
 *  hit besides a ruling admission — a record, not a judgement inside the matcher. Mirrored into
 *  scripts/lib/served-corpus-authors.mjs for the deploy gate; the invariant test asserts the two
 *  are identical. */
export const REVIEWED_SURNAME_CLEARANCES: Readonly<Record<string, string>> = {
  'Bayly, Lewis':
    'Lewis Bayly (d. 1631), bishop, author of The Practice of Piety — a different person from C. S. Lewis (d. 1963), public domain in fact. The only surname-token hit in the measured 1,212-file static corpus at the 2026-08-21 close-out; cleared then.',
};

/** Does this author string LOOK like a MUST_NOT_SERVE name, in any format?
 *
 *  Word-boundary matched so 'lewis' hits "Lewis, Howell Elvet" (a genuinely different person — a
 *  deliberate false positive for review) but not "Lewisham". This answers "should a human look?",
 *  never "is this refused?". */
export function authorLooksMustNotServe(author: string | null | undefined): boolean {
  if (!author) return false;
  const tokens = new Set(author.toLowerCase().split(/[^a-z]+/).filter(Boolean));
  return MUST_NOT_SERVE_SURNAMES.some((s) => tokens.has(s));
}

/** Is this work admitted to serve despite its author matching? Only an owner ruling can say yes. */
export function isRulingAdmittedWork(slug: string): boolean {
  const year = MUST_NOT_SERVE_WORK_EXCEPTIONS[slug];
  return year !== undefined && year < ADR112_CUTOFF_YEAR;
}

/** The audit itself: rows that must not be serving, given the rulings. */
export function auditServedWorks(
  rows: readonly { slug: string; author: string | null; served: number }[],
): { slug: string; author: string | null; served: number }[] {
  return rows.filter(
    (r) =>
      r.served > 0 &&
      authorLooksMustNotServe(r.author) &&
      !isRulingAdmittedWork(r.slug) &&
      !(r.author !== null && r.author in REVIEWED_SURNAME_CLEARANCES),
  );
}

/** Exported for the coverage guard test. */
export const _MUST_NOT_SERVE_AUTHORS_FOR_TEST = MUST_NOT_SERVE_AUTHORS;
