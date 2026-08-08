// The builder's default shape, derived from the book — block `L2b`.
//
// THE DEFECT: `weeks` and `daysPerWeek` were constants (8 and 5). At 5 days/week that is 40 reading
// slots, and the builder opens on `rom` — Romans, 16 chapters — so it rendered its own validation
// error and disabled `Create plan` before the reader touched anything. Confirmed live 2026-08-07.
//
// ── A DEVIATION FROM THE BLOCK'S LITERAL TEXT, AND WHY IT IS ARITHMETIC, NOT SCOPE ──────────────
// L2b says: "Derive default weeks from the chosen book: ceil(chapters / daysPerWeek)". That cannot
// close the finding. The real validation (`expand.ts:130-134`) refuses when
// `chapters < weeks * daysPerWeek`, so with `daysPerWeek` FIXED at 5, any book with fewer than 5
// chapters has NO positive week count that satisfies it — `weeks >= 1` already demands 5 slots.
//
// That is not an edge case: **19 of 66 books** have fewer than 5 chapters (Jude, Philemon, Obadiah,
// 2-3 John, Haggai, Titus, Joel, Nahum, Habakkuk, Zephaniah, 2 Thess, Ruth, Jonah, Malachi,
// Philippians, Colossians, 2 Timothy, 2 Peter). Deriving weeks alone leaves nearly a third of the
// picker opening in an error state — the exact symptom the block exists to remove.
//
// So both halves of the arithmetic are derived. It remains ONE function and ONE call site, and it
// touches neither the validation nor the pre-commit preview, which the block's Do-NOT protects.
// Flagged in the Findings log for the owner rather than done quietly.

import { BOOK_BY_SLUG } from '@/bible/books';

const MAX_WEEKS = 104; // the weeks input's own max, measured on the live builder
const MAX_DAYS_PER_WEEK = 7;

export interface PlanShape {
  weeks: number;
  daysPerWeek: number;
}

/**
 * A shape that the builder's own validation accepts on open.
 *
 * `preferredDaysPerWeek` is the reader's choice when they have made one; it is only ever reduced,
 * never raised, so choosing 3 days a week on a long book is respected.
 */
export function defaultPlanShape(bookSlug: string, preferredDaysPerWeek = 5): PlanShape {
  const chapters = BOOK_BY_SLUG.get(bookSlug)?.chapterCount;
  // Unknown slug: the picker cannot produce one, so this arm means the data is already odd. A
  // usable default beats throwing inside a render.
  if (!chapters || chapters < 1) return { weeks: 1, daysPerWeek: 1 };

  // A week cannot ask for more days than the book has chapters.
  const daysPerWeek = Math.max(1, Math.min(preferredDaysPerWeek, MAX_DAYS_PER_WEEK, chapters));
  // floor, not ceil: a trailing partial week would add slots the book cannot fill, which is the
  // error this exists to prevent. At least one week, because zero weeks is not a plan.
  const weeks = Math.min(MAX_WEEKS, Math.max(1, Math.floor(chapters / daysPerWeek)));
  return { weeks, daysPerWeek };
}
