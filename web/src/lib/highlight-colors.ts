// Highlight palette. Class strings are literal so Tailwind's scanner emits them.
//
// TEN COLOURS, and the two that used to read as one are gone. The old set shipped `yellow`
// (bg-yellow-400 dot) beside `amber` (bg-amber-400 dot): adjacent hues at the same lightness, which
// on the swatch row rendered as two near-identical circles — a reader could not tell which they had
// picked, and a colour-coding scheme built on them silently collapsed. `amber` is now the darker
// orange it was always meant to be, and the additions fill the gaps a study scheme actually needs:
// violet/purple for a doctrinal thread, teal/lime to separate two "green" ideas, and rose to mark a
// warning distinct from pink.
//
// IDS ARE PERSISTED, so treat them as append-only: `highlights.color` is a bare TEXT column
// (db/schema.sql:345) with NO check constraint, so no migration is needed to add one, and
// `HIGHLIGHT_BG` simply has no entry for an unknown id — a row written by a newer client renders
// unstyled on an older one rather than breaking it. Never RENAME an id; add, and retire by removing
// from this list only once nothing in the wild still writes it.
export const HIGHLIGHT_COLORS = [
  { id: 'yellow', bg: 'bg-yellow-200/70', dot: 'bg-yellow-400' },
  { id: 'amber', bg: 'bg-amber-300/70', dot: 'bg-amber-500' },
  { id: 'lime', bg: 'bg-lime-200/70', dot: 'bg-lime-400' },
  { id: 'green', bg: 'bg-green-200/70', dot: 'bg-green-400' },
  { id: 'teal', bg: 'bg-teal-200/70', dot: 'bg-teal-400' },
  { id: 'sky', bg: 'bg-sky-200/70', dot: 'bg-sky-400' },
  { id: 'violet', bg: 'bg-violet-200/70', dot: 'bg-violet-400' },
  { id: 'purple', bg: 'bg-purple-200/70', dot: 'bg-purple-400' },
  { id: 'pink', bg: 'bg-pink-200/70', dot: 'bg-pink-400' },
  { id: 'rose', bg: 'bg-rose-200/70', dot: 'bg-rose-400' },
] as const;

export const HIGHLIGHT_BG: Record<string, string> = Object.fromEntries(
  HIGHLIGHT_COLORS.map((c) => [c.id, c.bg]),
);
