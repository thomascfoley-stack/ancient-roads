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
// THE CEILING IS A 4x4 GRID, SIXTEEN PANES (UX-3). It was three, enforced here for a prose
// measure ("below ~360px a column of prose stops being readable"). The owner's grid ruling
// (order 2026-08-02: "we're gonna have to go to a 4x4, not a side-by-side aspect") replaced the
// measure argument with a SHAPE argument: the ceiling is now the largest grid that stays a grid.
// The cap is still enforced HERE rather than in the UI, because a URL is user-editable input —
// `?p=` repeated a hundred times must be truncated by the parser, not by whatever the layout
// happens to do with a hundred grid cells. It is a ceiling, not an invitation: the DOM cost of a
// full desk is bounded per pane (each pane windows its sections — see desk-pane.tsx), and sixteen
// windowed panes is the budget that keeps the whole desk bounded.
//
// THE REGISTER WALL APPLIES. A desk that puts a hymn beside a commentary is exactly the adjacency
// the wall governs: lane content may sit ALONGSIDE exegesis, labelled, and may never be presented
// AS exegesis. So every pane carries its kind, and `paneRegisterLabel` is the single place that
// decides what a pane is called. There is no unlabelled pane, and no pane whose label is inferred
// from its position.

export const MAX_PANES = 16;

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
  /** Optional initial ordinal so a pane added beside a Scripture passage opens near it (F-158). */
  ordinal?: number;
}

export type Pane = ScripturePane | WorkPane;

/**
 * Serialise one pane to its `p=` value. `scripture:john/3` | `work:spurgeon-sermons` | `work:spurgeon-sermons:42`.
 * Kept deliberately readable: these URLs get pasted into messages between people studying together.
 */
export function encodePane(p: Pane): string {
  if (p.kind === 'scripture') return `scripture:${p.book}/${p.chapter}`;
  return p.ordinal !== undefined ? `work:${p.slug}:${p.ordinal}` : `work:${p.slug}`;
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
    // Optional ordinal suffix: work:slug:42
    const [slug, ordinalRaw] = rest.split(':');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug ?? '')) return null;
    if (ordinalRaw === undefined) return { kind: 'work', slug: slug! };
    const ordinal = Number(ordinalRaw);
    if (!Number.isInteger(ordinal) || ordinal < 1) return null;
    return { kind: 'work', slug: slug!, ordinal };
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
 * What the parser did with a desk URL: the panes that fit, and how many did not.
 *
 * A078 — THE CAP WAS ENFORCED IN SILENCE. An over-long desk URL rendered the panes that fit and
 * said nothing about the rest, so a reader who shared or hand-edited an over-cap desk got a page
 * that looked complete and was not. The rule at the top of this file — "a missing pane is visibly
 * missing" — holds when you know how many you asked for; the person opening a link someone else
 * sent does not. The cap itself moves with the layout model (3, then the UX-3 4x4 ceiling of 16);
 * what A078 changed is that the cap now REPORTS, and the surface says so (see app/desk/page.tsx).
 *
 * `overflow` counts ONLY panes that parsed AND were not already on the desk, because those are the
 * only ones the reader actually lost. A malformed `p=` was never a pane (that is `decodePane`'s
 * own documented rule, and it has its own reason), and a duplicate is already in front of them. A
 * notice that announced either would name a loss that did not happen, which is a worse failure
 * than the silence it replaces — the count has to mean one thing.
 */
export interface DeskDecodeReport {
  panes: Pane[];
  /** Valid, distinct panes in the URL beyond MAX_PANES — the ones that did not open. */
  overflow: number;
}

/**
 * Parse the whole desk from `?p=` values (repeated, or comma-joined), reporting the overflow.
 *
 * Deduped, so the same work cannot occupy two panes — that is always a mistake and it wastes one
 * of the desk's slots. Truncated to MAX_PANES *after* dedupe, so `a,a,b,c,…` fills the desk with
 * distinct panes rather than spending slots on duplicates: deduping first is what makes the cap
 * mean "sixteen distinct things".
 */
export function decodeDeskReport(values: readonly string[]): DeskDecodeReport {
  const seen = new Set<string>();
  const out: Pane[] = [];
  let overflow = 0;
  for (const raw of values.flatMap((v) => v.split(','))) {
    const pane = decodePane(raw);
    if (!pane) continue;
    const key = encodePane(pane);
    if (seen.has(key)) continue;
    seen.add(key);
    // Past the cap we keep SCANNING instead of breaking — the only change to the original loop.
    // A count of what did not fit cannot be known without reading to the end, and the RESULT is
    // still bounded at MAX_PANES; only the tally grows. This is not new work in the bad case
    // either: the old loop already walked the whole input whenever the first MAX_PANES entries
    // were not all valid and distinct, which is exactly the hostile-URL case.
    if (out.length < MAX_PANES) out.push(pane);
    else overflow += 1;
  }
  return { panes: out, overflow };
}

/** The panes alone, for the callers that have nothing to say about the overflow. */
export function decodeDesk(values: readonly string[]): Pane[] {
  return decodeDeskReport(values).panes;
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
 * The grid a desk of `count` panes lays out in, as { cols, rows } (UX-3).
 *
 * Pure and total by design: the desk's state is a shareable URL, so a desk must place its panes
 * the same way on every screen that opens it — a CSS `auto-fill` grid would reflow with viewport
 * width and the recipient of a link would not see the desk the sender sent. The shape is a table,
 * not a heuristic: columns grow with ceil(sqrt(n)) up to the 4x4 ceiling (the owner's stated
 * shape), rows follow, and every cell count ≥ the pane count. Out-of-range input clamps into the
 * table rather than producing a shape the grid cannot be (the parser already bounds real input to
 * MAX_PANES; this function does not trust that it is only ever called from there).
 *
 * The same function drives the page's grid classes (app/desk/page.tsx) — one definition of the
 * shape, so the notice that says "16" and the grid that places 16 can never disagree.
 */
export function deskGridShape(count: number): { cols: number; rows: number } {
  const n = Number.isFinite(count) ? Math.min(Math.max(1, Math.floor(count)), MAX_PANES) : 1;
  const cols = Math.min(Math.ceil(Math.sqrt(n)), 4);
  return { cols, rows: Math.ceil(n / cols) };
}

/**
 * Add a pane, returning the new desk. At the cap the OLDEST pane is evicted, not the newest: the
 * reader just asked for the new thing, so dropping it would make the button appear broken. Adding
 * a pane that is already open is a no-op rather than a reshuffle — the thing they asked for is
 * already in front of them.
 *
 * A078, THE HALF THIS FUNCTION CANNOT FIX. That eviction is silent at its one real call site:
 * `app/library/[catalog]/page.tsx` builds the "+" href as `deskHref(withPane(openDesk, work))`, so
 * a reader who adds a work to a full desk lands on a desk with their FIRST pane quietly gone.
 * (Note that it does ADD — the QA claim that "+" REPLACES the desk is false, and a second session
 * already contradicted it.) The desk page cannot detect this after the fact: by the time the URL
 * arrives the evicted pane is simply absent, indistinguishable from never having been there.
 * Fixing it means the library's "+" saying so at the moment of the click, which is a change to a
 * file this pass does not own. Filed rather than smuggled in through a brand or a side channel on
 * the returned array — a desk URL that means something different depending on which function
 * produced it is worse than the defect.
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
