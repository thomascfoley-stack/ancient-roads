// The default name for a plan the reader did not name themselves — block `L2c`.
//
// WAS: `${spec.scope.book} in ${weeks} weeks`, which produced `rom in 3 weeks` — the internal book
// slug, lowercase, on a label that appears every day for weeks. Observed live 2026-08-07: the
// create call returned `"title":"rom in 3 weeks"`.
//
// NO NEW LOOKUP TABLE. `BOOK_BY_SLUG` already maps `rom` -> `Romans` and is the same record the
// picker renders from, so the name shown in the builder and the name stored cannot drift.

import { BOOK_BY_SLUG } from '@/bible/books';
import { resolveCanonicalGroup } from './canonical-groups';

export interface PlanSpecForTitle {
  scope:
    | { kind: 'book'; book: string }
    | { kind: 'range'; ref: string }
    | { kind: 'books'; group: string }
    | { kind: 'topic'; workSlug: string; sectionId: number };
  weeks: number;
}

export function defaultPlanTitle(spec: PlanSpecForTitle): string {
  const what =
    spec.scope.kind === 'book'
      ? // Fall back to the slug for an unknown book rather than throwing: the picker cannot produce
        // one, so this arm means the data is already odd, and an odd title beats a failed create.
        (BOOK_BY_SLUG.get(spec.scope.book)?.name ?? spec.scope.book)
      : spec.scope.kind === 'range' ? spec.scope.ref
      : spec.scope.kind === 'books' ? (resolveCanonicalGroup(spec.scope.group)?.label ?? spec.scope.group)
      : 'Topical plan'; // topic scope resolves its verified title at the call site; unreachable here

  if (spec.scope.kind === 'topic') return what;
  // `·` not `in`: `Romans · 3 weeks` reads as a label, `Romans in 3 weeks` reads as a sentence the
  // product is making. Spec §2 fixes the separator.
  return `${what} · ${spec.weeks} week${spec.weeks === 1 ? '' : 's'}`;
}
