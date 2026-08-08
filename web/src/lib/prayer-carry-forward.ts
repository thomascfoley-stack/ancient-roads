// First-launch carry-forward: the sidebar's localStorage study objects -> prayer journal entries.
//
// Block `PR1a`, absorbing `N4`'s migration ruling ("existing objects migrate into the prayer
// journal as entries; nothing user-created gets hidden or dropped", owner 2026-08-08). `N4` could
// not execute that ruling server-side because there is nothing server-side to move: the objects
// live in each browser's `localStorage` under `study-sections:v1:<userId>` (`sidebar.tsx:42`), and
// that file contains no `fetch` at all. So the migration has to happen in the browser that holds
// them, once, on first launch of the prayer journal.
//
// ── THE THREE CONSTRAINTS, AND WHY EACH ONE IS HERE ─────────────────────────────────────────────
//
// 1. RUNS ONCE. A migration that re-runs duplicates prayers, and a duplicated prayer is not a
//    tidy-up problem — it is someone's words, twice, with no way for them to know which is real.
//
// 2. BEST-EFFORT. It must never block, break, or slow the journal. A reader opening the prayer
//    space is not there to watch a migration; if it fails, the journal still opens and the source
//    data is still on disk.
//
// 3. IT DOES NOT DELETE ITS SOURCE IN THIS RELEASE. This is what makes constraint 1's failure mode
//    survivable and is why the safe choice is available at all. If the run half-completes — some
//    posts landed, the marker write failed, the tab closed — we DO NOT retry, because we cannot
//    tell what got through and a duplicate is worse than a miss. That would be data loss if the
//    source were gone. It is not gone; it is still in `localStorage`, unread but intact, and a
//    later release can reconcile deliberately. Delete the key and the same code becomes lossy.

/** The sidebar's shape. Duplicated deliberately rather than imported: this module must keep
 *  reading the OLD payload correctly even after the sidebar's own types move on. */
interface StoredItem {
  id?: unknown;
  name?: unknown;
}
interface StoredSection {
  id?: unknown;
  name?: unknown;
  items?: unknown;
}

/** The two sections every reader gets whether they did anything or not (`sidebar.tsx:24-27`).
 *  Empty, they are furniture, not content — carrying them forward would put "Channels" in the
 *  prayer journal of every reader who never used the feature. */
const SEED_SECTION_IDS = new Set(['channels', 'partners']);

/** A pathological or hand-edited payload must not spray the API. Far above any real list. */
export const CARRY_FORWARD_MAX = 100;

export const CARRY_FORWARD_MARKER = 'prayer-carry-forward:v1';

export interface CarriedEntry {
  /** The prayer body to create. */
  body: string;
}

/**
 * What to carry, given the raw localStorage string. Pure — no storage, no network — so the rule
 * about what counts as user-created is testable without a browser.
 *
 * Returns `[]` for every "nothing to do" case: absent key, unparseable JSON, wrong shape, seed
 * data untouched. Never throws; a migration that throws on malformed input fails the reader's
 * whole journal for a stale key.
 */
export function collectCarryForward(raw: string | null): CarriedEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: CarriedEntry[] = [];
  for (const section of parsed as StoredSection[]) {
    if (!section || typeof section !== 'object') continue;
    const sectionName = typeof section.name === 'string' ? section.name.trim() : '';
    const items = Array.isArray(section.items) ? (section.items as StoredItem[]) : [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!name) continue;
      // The section name is CONTEXT, not a title: the reader wrote "Mum's surgery" under
      // "Study Partners", and the prayer is the former. Kept only when it says something.
      const body = sectionName && !SEED_SECTION_IDS.has(String(section.id)) ? `${name}\n\n(from ${sectionName})` : name;
      out.push({ body });
      if (out.length >= CARRY_FORWARD_MAX) return out;
    }

    // A section the reader MADE and left empty is still something they created — the ruling says
    // nothing user-created gets dropped. The two seed sections are excluded whether empty or not.
    if (items.length === 0 && sectionName && !SEED_SECTION_IDS.has(String(section.id))) {
      out.push({ body: sectionName });
      if (out.length >= CARRY_FORWARD_MAX) return out;
    }
  }
  return out;
}

/** The sidebar's key, re-derived here so this module does not import a client component. */
export function studySectionsKey(userId: string | undefined): string {
  return `study-sections:v1:${userId ?? 'guest'}`;
}

/**
 * Run the carry-forward in the browser, at most once per reader.
 *
 * `post` is injected so the test drives the real control flow — the once-only guard, the
 * marker-before-post ordering, the swallowed failure — without a network or a DOM.
 * Returns the number of prayers created.
 */
export async function runCarryForward(
  userId: string | undefined,
  post: (body: string) => Promise<void>,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): Promise<number> {
  try {
    // Constraint 1, checked FIRST and cheaply: if this reader has ever started a run, stop. Note
    // "started", not "finished" — see the header. A half-run leaves the marker set and the source
    // intact, and we accept a possible miss over a possible duplicate.
    if (storage.getItem(CARRY_FORWARD_MARKER)) return 0;

    const entries = collectCarryForward(storage.getItem(studySectionsKey(userId)));
    if (entries.length === 0) {
      // Nothing to carry: still mark done, so a reader with no study objects never re-reads this
      // path on every visit for the life of the release.
      storage.setItem(CARRY_FORWARD_MARKER, 'empty');
      return 0;
    }

    // Marker BEFORE the first post. If the tab dies mid-run we must not repeat what landed.
    storage.setItem(CARRY_FORWARD_MARKER, 'started');
    let created = 0;
    for (const entry of entries) {
      await post(entry.body);
      created += 1;
    }
    storage.setItem(CARRY_FORWARD_MARKER, 'done');
    return created;
  } catch {
    // Constraint 2. A failed migration is a non-event for the reader: the journal opens, the
    // source key is untouched, and nothing is retried.
    return 0;
  }
}
