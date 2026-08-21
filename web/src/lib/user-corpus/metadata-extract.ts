// Sermon-shaped metadata, extracted not typed (docs/MY_WORKS_DRAFT_AND_METADATA_DESIGN.md §2).
//
// Sermon manuscripts are highly regular: the stated text and often a preached-on date sit in the
// first lines. This reads ONLY the head, suggests display-only chips, and holds PRECISION over
// recall throughout — a wrong suggestion sits beside the user's own title, so "no suggestion"
// always beats a guess. That is why the date grammar is named-month-only: "3/4/1871" is the 3rd
// of April in London and the 4th of March in Boston, and this module does not gamble on which
// pulpit the manuscript came from.

import { scanReferences } from '@bible/ref-parse';
import { isExplicitCitation } from '@bible/explicit-citation';

/** How much of the manuscript counts as "the head". Past this, a citation is content, not title. */
export const METADATA_HEAD_CHARS = 2_000;

export interface SermonMetadata {
  /** The first explicit stated text in the head, canonical display form. */
  reference: string | null;
  /** ISO date (yyyy-mm-dd) when a named-month date appears in the head. */
  date: string | null;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// "21st September, 1871" | "September 21, 1871" — named month required, ordinal suffix optional.
const DAY_FIRST = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s*,?\s+(\d{4})\b/i;
const MONTH_FIRST = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s+(\d{4})\b/i;

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isoOrNull(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]!) return null;
  if (month === 2 && day === 29 && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Pure. Suggestions only — nothing here may overwrite what the user typed. */
export function extractSermonMetadata(text: string): SermonMetadata {
  const head = text.slice(0, METADATA_HEAD_CHARS);

  // The stated text: the FIRST reference in the head that survives the explicit-citation
  // precision gate — the same gate the anchor channel uses, so "a stated text" here means
  // exactly what "an explicit anchor" means there.
  let reference: string | null = null;
  for (const ref of scanReferences(head)) {
    if (!isExplicitCitation(ref.display, head)) continue;
    reference = ref.display;
    break;
  }

  let date: string | null = null;
  const d1 = DAY_FIRST.exec(head);
  const d2 = MONTH_FIRST.exec(head);
  // Earliest match in the head wins when both grammars fire.
  const pick = d1 && d2 ? (d1.index <= d2.index ? d1 : d2) : (d1 ?? d2);
  if (pick === d1 && d1) date = isoOrNull(Number(d1[3]), MONTHS[d1[2]!.toLowerCase()]!, Number(d1[1]));
  else if (pick === d2 && d2) date = isoOrNull(Number(d2[3]), MONTHS[d2[1]!.toLowerCase()]!, Number(d2[2]));

  return { reference, date };
}
