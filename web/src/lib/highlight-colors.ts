// Highlight palette. Class strings are literal so Tailwind's scanner emits them.
export const HIGHLIGHT_COLORS = [
  { id: 'yellow', bg: 'bg-yellow-200/70', dot: 'bg-yellow-400' },
  { id: 'green', bg: 'bg-green-200/70', dot: 'bg-green-400' },
  { id: 'sky', bg: 'bg-sky-200/70', dot: 'bg-sky-400' },
  { id: 'pink', bg: 'bg-pink-200/70', dot: 'bg-pink-400' },
  { id: 'amber', bg: 'bg-amber-200/70', dot: 'bg-amber-400' },
] as const;

export const HIGHLIGHT_BG: Record<string, string> = Object.fromEntries(
  HIGHLIGHT_COLORS.map((c) => [c.id, c.bg]),
);
