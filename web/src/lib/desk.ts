// THE STUDY DESK — pane state, encoded in the URL.
//
// How people actually study (the request this was built for): Scripture open on the left, a
// commentary beside it, and a third thing — a sermon on the passage, a hymn, a historian — beside
// that. The existing surfaces each show ONE work at a time, so comparing meant losing your place.
//
// WHY THE URL IS THE STATE. A desk you cannot send to someone is half a study tool, and a desk that
// lives in localStorage silently diverges between tabs. `/desk?p=...&p=...` is shareable,
// back-button-correct, and restores exactly. It also means the pane list is server-readable, which
// is what lets the page label every pane's register without a round trip per pane.
//
// THREE PANES, MAX. Not arbitrary: below ~360px of width a column of prose stops being readable,
// and three is what fits a 1280px desktop with the reading measure intact. The cap is enforced HERE
// rather than in the UI, because a URL is user-editable input — `?p=` repeated ten times must be
// truncated by the parser, not by whatever the layout happens to do with ten columns.
//
// THE REGISTER WALL APPLIES. A desk that puts a hymn beside a commentary is exactly the adjacency
// the wall governs: lane content may sit ALONGSIDE exegesis, labelled, and may never be presented
// AS exegesis. So every pane carries its kind, and `paneRegisterLabel` is the single place that
// decides what a pane is called. There is no unlabelled pane, and no pane whose label is inferred
// from its position.

export const MAX_PANES = 3;

/** A Scripture pane: one chapter. */
export interface ScripturePane {
  kind: 'scripture';
  /** Book slug as used by /read/[book]/[chapter], e.g. "john". */
  book: string;
  chapter: number;
}

/** A corpus pane: one work from the library (commentary, sermon, hymn, poetry, historian, father). */
export interface WorkPane {
  kind: 'work';
  slug: string;
}

export type Pane = ScripturePane | WorkPane;

/**
 * Serialise one pane to its `p=` value. `scripture:john/3` | `work:spurgeon-sermons`.
 * Kept deliberately readable: these URLs get pasted into messages between people studying together.
 */
export function encodePane(p: Pane): string {
  return p.kind === 'scripture' ? `scripture:${p.book}/${p.chapter}` : `work:${p.slug}`;
}

/**
 * Parse one `p=` value. Returns null for anything unrecognised — a bad pane is DROPPED, never
 * guessed at and never rendered as an empty frame.
 *
 * Dropping is safe here in a way it is NOT safe for a search filter: a missing pane is visibly
 * missing (you see two panes when you asked for three), whereas a dropped search filter is
 * invisible and shows more than you asked for. Widening is the thing that must never be silent;
 * narrowing announces itself.
 */
export function decodePane(raw: string): Pane | null {
  const value = raw.trim();
  if (!value) return null;

  const sep = value.indexOf(':');
  if (sep < 1) return null;
  const kind = value.slice(0, sep);
  const rest = value.slice(sep + 1);

  if (kind === 'work') {
    // Work slugs are the library's own identifiers: lowercase, digits, hyphens.
    return /^[a-z0-9][a-z0-9-]*$/.test(rest) ? { kind: 'work', slug: rest } : null;
  }

  if (kind === 'scripture') {
    const slash = rest.lastIndexOf('/');
    if (slash < 1) return null;
    const book = rest.slice(0, slash);
    const chapter = Number(rest.slice(slash + 1));
    if (!/^[a-z0-9][a-z0-9-]*$/.test(book)) return null;
    // A chapter must be a positive integer. `Number('3abc')` is NaN and `Number('')` is 0, so both
    // fall out here; the range is re-checked against the real book by the pane that renders it.
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > 300) return null;
    return { kind: 'scripture', book, chapter };
  }

  return null;
}

/**
 * Parse the whole desk from `?p=` values (repeated, or comma-joined).
 *
 * Deduped, so the same work cannot occupy two panes — that is always a mistake and it wastes one of
 * three slots. Truncated to MAX_PANES *after* dedupe, so `a,a,b,c` yields three panes rather than
 * two: deduping first is what makes the cap mean "three distinct things".
 */
export function decodeDesk(values: readonly string[]): Pane[] {
  const seen = new Set<string>();
  const out: Pane[] = [];
  for (const raw of values.flatMap((v) => v.split(','))) {
    const pane = decodePane(raw);
    if (!pane) continue;
    const key = encodePane(pane);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pane);
    if (out.length === MAX_PANES) break;
  }
  return out;
}

/** Serialise a desk back to a query string, e.g. `p=scripture:john/3&p=work:x`. */
export function encodeDesk(panes: readonly Pane[]): string {
  const qs = new URLSearchParams();
  for (const p of panes.slice(0, MAX_PANES)) qs.append('p', encodePane(p));
  return qs.toString();
}

/** The desk URL for a set of panes. */
export function deskHref(panes: readonly Pane[]): string {
  const qs = encodeDesk(panes);
  return qs ? `/desk?${qs}` : '/desk';
}

/**
 * Add a pane, returning the new desk. At the cap the OLDEST pane is evicted, not the newest: the
 * reader just asked for the new thing, so dropping it would make the button appear broken. Adding
 * a pane that is already open is a no-op rather than a reshuffle — the thing they asked for is
 * already in front of them.
 */
export function withPane(panes: readonly Pane[], pane: Pane): Pane[] {
  const key = encodePane(pane);
  if (panes.some((p) => encodePane(p) === key)) return [...panes];
  const next = [...panes, pane];
  return next.length > MAX_PANES ? next.slice(next.length - MAX_PANES) : next;
}

/** Remove the pane at `index`. Out-of-range is a no-op. */
export function withoutPane(panes: readonly Pane[], index: number): Pane[] {
  if (index < 0 || index >= panes.length) return [...panes];
  return panes.filter((_, i) => i !== index);
}

/**
 * Replace the pane at `index` in place, keeping its position. Out-of-range is a no-op. Replacing
 * with a pane already open elsewhere on the desk collapses the duplicate: the desk never shows the
 * same thing twice (the same rule `withPane` applies on add).
 */
export function replacePane(panes: readonly Pane[], index: number, pane: Pane): Pane[] {
  if (index < 0 || index >= panes.length) return [...panes];
  const key = encodePane(pane);
  const dupAt = panes.findIndex((p, i) => i !== index && encodePane(p) === key);
  const next = panes.map((p, i) => (i === index ? pane : p));
  return dupAt === -1 ? next : next.filter((_, i) => i !== dupAt);
}

/**
 * The register label for a pane, from the source_type the library already carries.
 *
 * ONE definition, and it is exhaustive by construction: an unknown source_type falls back to the
 * raw type rather than to a friendly-sounding default. A pane labelled "Commentary" that is
 * actually a hymn is precisely the register breach the wall forbids, so an unrecognised type must
 * look unrecognised, not plausible.
 */
export function paneRegisterLabel(sourceType: string | null | undefined): string {
  switch (sourceType) {
    case 'commentary':
      return 'Commentary';
    case 'father':
      return 'Church Father';
    case 'sermon':
      return 'Sermon';
    case 'hymn':
      return 'Hymn';
    case 'poetry':
      return 'Poetry';
    case 'historian':
      return 'History';
    case 'theology':
      return 'Theology';
    case 'confession':
      return 'Confession';
    default:
      return sourceType && sourceType.length > 0 ? sourceType : 'Unlabelled';
  }
}
