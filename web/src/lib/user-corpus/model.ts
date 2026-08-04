// The embedding model, in ONE place, with the parity rule that guards the tradition-gap join.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────
// ADR-102 closed B2 on `BAAI/bge-large-en-v1.5`. §6 of the design calls parity non-negotiable: a
// user chunk embedded by a different model makes the join compare vectors from two spaces and
// return **plausible garbage, with no error, forever**. Jina v3 is ALSO 1024-dim, so a mismatch
// inserts, joins and scores cleanly — there is nothing to catch except a check that looks.
//
// The literal is hand-typed in **12 places** across the tree with zero shared exports, which is
// this repo's most-punished defect class. This module is the single source for the USER plane.
// (The corpus plane's twelve are a pre-existing condition; fixing them means editing ingest broadly
// and belongs to Lane A, not to this slice. Recorded, not silently inherited.)
//
// ── THE TRAP, MEASURED AGAINST THE LIVE DATABASE ────────────────────────────────────────────────
// The corpus stores TWO DIFFERENT STRINGS for the one model, in two tables:
//
//     section_embeddings.model_slug        'bge-large-en-v1.5'        362,948 rows
//     embeddings.metadata->>'model'        'BAAI/bge-large-en-v1.5'  1,070,674 rows
//
// and the tradition-gap join reads `embeddings`, because that is where `served` lives — while
// migration 100 documented the user table as carrying the short form. So "compare the slugs" has no
// single right answer, and the natural implementations are both wrong:
//
//   * `userRow.model_slug === EMBED_MODEL` (the client constant) is **tautologically green** — the
//     writer and the check read the same constant, so every user row passes while silently
//     mismatching the corpus. The bug wearing the check's uniform.
//   * `userRow.model_slug === 'bge-large-en-v1.5'` passes against `section_embeddings` and FAILS
//     against every row of `embeddings`, which is the plane the join actually uses.
//
// **Parity is about the MODEL, not the spelling.** Both strings name one model and its vectors are
// comparable either way; a different MODEL is what must be refused. So comparison is normalised,
// and the check is fed the corpus's own recorded value rather than our constant.

/** The id DeepInfra is called with. The one string that is not derived. */
export const EMBEDDING_API_MODEL = 'BAAI/bge-large-en-v1.5';

/**
 * The slug stored in `user_section_embeddings.model_slug`, DERIVED from the API id rather than
 * typed again. Matches `section_embeddings`' convention (vendor prefix stripped).
 */
export const EMBEDDING_DB_SLUG = EMBEDDING_API_MODEL.replace(/^[^/]+\//, '');

/** Vector width. Asserted at insert, because a wrong-width vector cannot even be stored. */
export const EMBEDDING_DIMS = 1024;

/**
 * Reduce a model identifier to its identity: vendor prefix stripped, lowercased, whitespace
 * trimmed. `BAAI/bge-large-en-v1.5`, `bge-large-en-v1.5` and `bge-large-en-v1.5 ` are one model.
 * `jina-embeddings-v3` is not.
 */
export function normaliseModel(s: string): string {
  return s.trim().replace(/^[^/]+\//, '').toLowerCase();
}

/** Do these two identifiers name the same model, however each was spelled? */
export function isSameModel(a: string, b: string): boolean {
  return normaliseModel(a) === normaliseModel(b);
}

/**
 * Is a stored user row comparable with the corpus?
 *
 * `corpusModel` MUST be the value the corpus itself recorded — read from the corpus plane the join
 * targets — never `EMBEDDING_API_MODEL`. Passing our own constant makes this return true for
 * everything we write, which is precisely the tautology this function exists to avoid, so callers
 * are required to supply it and there is deliberately no default.
 */
export function isJoinable(userModelSlug: string, corpusModel: string): boolean {
  return isSameModel(userModelSlug, corpusModel);
}
