// THE FROZEN RECORD of the four serving filters as they stood BEFORE migration 042.
//
// WHY THIS FILE EXISTS (2026-08-03 audit, finding 1, CONFIRMED). The first version of
// verify-served-backfill.mjs derived its expected set from the LIVE routing.ts "so it could
// never be a stale copy." The same commit rewrote routing.ts's LEGAL_CORPUS_FILTER to
// `(served)` — at which point the verifier was diffing `served` against `served`: its equality
// check became a tautology on prose rows, its licensing-cohort check became `served AND NOT
// (served)` (unsatisfiable), and its red-proof counted ANY failure as success. A verifier whose
// expectation tracks the thing it verifies is not a verifier.
//
// So the expectation is FROZEN here, in one module, and consumed two ways:
//
//   scripts/verify-served-backfill.mjs        builds its expected row set from these legs.
//   test/invariants/served-backfill-frozen-sync.test.ts
//                                             asserts db/migrations/042_embeddings_served_expand.sql
//                                             contains each leg VERBATIM (whitespace-normalized),
//                                             so the migration and this record cannot drift.
//
// These strings are HISTORY, not configuration. They change only if 042 itself is rewritten
// before it is applied anywhere; after 042 lands on any real database they are immutable, the
// way a snapshot is. Do not "improve" them: verbatim-ness is the property.
//
// VALIDITY WINDOW. `served` equals this record only from the moment 042's backfill runs until
// the first intentional serve flip (e.g. serving the 76 published-but-unserved works). After
// that, verify-served-backfill's equality check is EXPECTED to diverge in the shipped-direction
// and the tool says so — post-flip reconciliation is a different instrument (sources.status
// vs served agreement), filed in the cutover order.

/** Old PROSE_TYPE_SQL — the six-type conjunct the old exegetical pool carried. */
export const FROZEN_PROSE_TYPES =
  `source_type IN ('commentary','sermon','father','theology','confession','lexicon')`;

/** Old LEGAL_CORPUS_FILTER, verbatim (the author allowlist + book-scoped legs + work leg). */
export const FROZEN_LEGAL_FILTER = `(
        metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
     OR (metadata->>'author'='John Chrysostom'    AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
     OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
     OR (metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin') AND metadata->>'sourceUrl' ILIKE '%crosswire%')
     OR metadata->>'work' IN ('keil-delitzsch','catena-aurea','chrysostom-homilies','augustine-homilies')
   )`;

/** Old SONG_VERSE filter ∧ type conjunct. */
export const FROZEN_SONG_TYPES = `source_type IN ('hymn','poetry')`;
export const FROZEN_SONG_WORKS =
  `metadata->>'work' IN ('olney-hymns','scottish-psalter-1650','neale-eastern-hymns','watts-hymns','watts-psalms','keble-christian-year','herbert-temple','montgomery-sacred-poems','rossetti-verses','traherne-poems','milton-poetical-works','hopkins-poems','tennyson-in-memoriam','dante-divine-comedy','wheatley-poems')`;

/** Old SERMON_CORPUS_FILTER — work list only, no type conjunct (the shipped predicate had none). */
export const FROZEN_SERMON_WORKS =
  `metadata->>'work' IN ('spurgeon-sermons','maclaren-expositions','watson-works','flavel-works','edwards-works','wesley-sermons','spurgeon-talks-to-farmers')`;

/** Old THEOLOGY_CORPUS_FILTER — same shape as the sermon lane. */
export const FROZEN_THEOLOGY_WORKS =
  `metadata->>'work' IN ('owen-works','hodge-systematic','calvin-institutes','schaff-creeds')`;

/**
 * The four backfill legs, exactly as 042 executes them, with the source_type set each leg's
 * rows are expected to carry (the tightening 042's index predicates rely on — asserted by the
 * verifier, never assumed).
 */
export const FROZEN_LEGS = [
  {
    name: 'exegetical pool',
    sql: `${FROZEN_PROSE_TYPES} AND ${FROZEN_LEGAL_FILTER}`,
    expectTypes: ['commentary', 'father'],
  },
  {
    name: 'song/verse lane',
    sql: `${FROZEN_SONG_TYPES} AND ${FROZEN_SONG_WORKS}`,
    expectTypes: ['hymn', 'poetry'],
  },
  {
    name: 'sermon lane',
    sql: FROZEN_SERMON_WORKS,
    expectTypes: ['sermon'],
  },
  {
    name: 'theology lane',
    sql: FROZEN_THEOLOGY_WORKS,
    expectTypes: ['theology', 'confession'],
  },
];

/** The whole frozen served set as one predicate — the verifier's expected membership test. */
export const FROZEN_UNION = FROZEN_LEGS.map((l) => `(${l.sql})`).join(' OR ');
