// The explicit-citation channel's gate.
//
// MOVED here from `src/ingest/ingest-historian.ts:45` (2026-08-03), not copied. Slice 1 needs it
// inside the Next app and `web/` cannot import `src/ingest/` — that is the A6 defect which killed
// a production deploy. Unlike the Slice 0 shingle primitives, this function is NOT frozen, so the
// right move was to relocate it and have its two existing callers import from here, leaving ONE
// implementation rather than the second copy the frozen files forced in `uncited-shingle.ts`.
//
// It had no tests. It has them now (`test/invariants/explicit-citation.test.ts`), including the
// regression for the defect its own comment describes.

/**
 * Does a scanned reference count as a genuine citation?
 *
 * `scanReferences` over free prose false-positives on bare aliases — a deep-audit found
 * `which is 3,000,000` parsed as Isaiah 3, via the `is` alias. So a reference is only explicit if
 * the book is NAMED in the text next to a digit ("Isa. 53:7", "1 Samuel 12"). Conservative by
 * design: a genuine citation always names its book, and anything else is dropped rather than
 * anchored. An anchor row is a claim about what a document cites; a false one is worse than a
 * missing one, because the uncited and semantic channels exist to catch what this drops.
 */
export function isExplicitCitation(display: string, body: string): boolean {
  const bookPart = display.replace(/[\s ]+[0-9].*$/, ''); // "1 Samuel 12:1–5" → "1 Samuel"
  const lastWord = bookPart.split(/\s+/).pop() ?? bookPart;
  const stem = lastWord.slice(0, Math.min(3, lastWord.length));
  if (!stem) return false;
  const re = new RegExp(
    // The chapter must be a DIGIT, or a roman numeral CLOSED BY A PERIOD ("John x. 10").
    //
    // ── DEFECT FIXED 2026-08-03, found while moving this function ──────────────────────────────
    // This was `[0-9ivxlc]` — a single character class meant to admit a roman chapter. It matched
    // the first letter of ANY word beginning i/v/x/l/c, which in English prose is constant.
    // Measured against the old rule:
    //     ADMIT "Romans 8" <- "The Romans conquered Britain."
    //     ADMIT "John 10"  <- "John came to bear witness of the light."
    //     ADMIT "Mark 4"   <- "Mark carefully what I say."
    //     ADMIT "Luke 2"   <- "Luke likewise records it."
    //     ADMIT "Acts 2"   <- "The acts victoriously performed."
    // Each of those became an EXPLICIT anchor row — and this repo's rule is that "a shingle hit is
    // probabilistic; an anchor row is a fact" (`ingest-sermon.ts:12`). It is the same alias
    // collision the function was written to kill ("which is 3,000,000" → Isaiah 3), returning
    // through the roman-numeral branch.
    //
    // The fix is strictly MORE CONSERVATIVE, which is the direction this function's own contract
    // asks for: "a genuine citation always names its book; anything else is dropped, never
    // anchored". It admits less, never more. Corpus rows already written under the loose rule are
    // unchanged on disk — whether to re-ingest is Lane A's call, recorded in the commit.
    `\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z]*\\.?\\s+(?:[0-9]|[ivxlc]{1,6}\\.)`,
    'i',
  );
  return re.test(body);
}
