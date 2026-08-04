// Count formatting for UI copy.
//
// "1 works" and "Jude · 1 chapters" both shipped, because every call site wrote the
// plural noun as a literal. Single-chapter books (Obadiah, Philemon, Jude, 2-3 John)
// and single-work catalogs are ordinary states here, not edge cases.
//
// Irregular plurals are passed explicitly; nothing tries to guess English morphology.

/** `3 works` / `1 work`. Pass `plural` when it is not just `singular + 's'`. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
}
