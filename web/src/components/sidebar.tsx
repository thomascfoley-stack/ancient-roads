'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { isPrayerWriting, PRAYER_WRITING_EVENT } from '@/lib/prayer-writing-mode';
import { CATALOGS, CATALOG_IDS, type CatalogId } from '@/lib/catalog-defs';
import { orderStudiesForNav, type StudySummary } from '@/components/save-to-study';
import { bibleTabHref, DEFAULT_BIBLE_HREF } from '@/lib/bible-position';
import { libraryLabel } from '@/lib/library-nav';

// --- user-defined study sections (parent/child). Stored locally per user
// while the real feature (saved work, conversation) is still coming soon;
// child pages render a ComingSoon notice. ---
interface StudyItem {
  id: string;
  name: string;
}

interface StudySection {
  id: string;
  kind: 'channels' | 'group';
  name: string;
  items: StudyItem[];
}

// N4. Both seeded sections were fake doors: `+` opened a name field, creating an object
// succeeded, and the reader landed on a placeholder saying the feature was being built.
//
//   - CHANNELS is REPURPOSED, not hidden. `PR1a` shipped the prayer journal, which is the real
//     feature behind the shell this section was, so the rail now links straight to it below.
//   - STUDY PARTNERS is RETIRED, not deferred. Any future cohort feature is greenfield.
//   - `New section` went with them: it has no referent once user-defined sections are gone.
//
// NOT badged "coming soon" — that would be a second fake door, which is what this block exists to
// remove. Nothing user-created is lost: `PR1a`'s carry-forward migrates existing items into the
// journal on first launch, and deliberately leaves this key in place (see `storageKey` above).
const SEED_SECTIONS: StudySection[] = [];

const DOT_COLORS = ['#8a4436', '#5c6b46', '#8a6a33', '#4e5d6b', '#7d5a4f'];

function dotColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DOT_COLORS[h % DOT_COLORS.length];
}

/**
 * ⚠ DO NOT DELETE OR CLEAR THIS KEY. It is load-bearing for a feature in another file.
 *
 * `lib/prayer-carry-forward.ts` migrates these objects into the prayer journal once, on first
 * launch, and deliberately LEAVES THIS KEY IN PLACE. That is not an oversight to tidy up in a
 * later release — it is half of a single decision:
 *
 * The carry-forward writes its once-only marker BEFORE the first post and never retries a
 * half-completed run, because after a crash mid-loop it cannot tell which prayers landed, and a
 * duplicate is worse than a miss: someone's words twice, with no way for them to tell which is
 * real. **That trade is only acceptable while this key still exists**, because then "a miss" means
 * "recoverable later" rather than "gone".
 *
 * Remove this key and the carry-forward's unchanged code silently becomes DATA LOSS. Nothing goes
 * red — its own test only guards against the module deleting its own source, and cannot see a
 * `removeItem` added here or in a cleanup script.
 *
 * Before removing it, a reconciliation pass must exist: read the source, compare against prayers
 * already carried, create only what is missing. Then this can go. Not before.
 */
function storageKey(userId: string | undefined): string {
  return `study-sections:v1:${userId ?? 'guest'}`;
}

/**
 * True while the element has content scrolled out of view below its own bottom edge.
 *
 * Drives the `.scroll-fade-b` mask on the rail's `<nav>` (see globals.css for why the rail
 * needs one at all). The measurement has to survive three separate ways the answer changes,
 * and an earlier sketch that only listened for `scroll` was wrong on the two that matter most
 * — the list is at scrollTop 0 on first paint, which is exactly when a reader decides the
 * list is complete:
 *   - the container resizes (window resize, sidebar collapse, phone rotation) -> ResizeObserver
 *   - the CONTENT grows or shrinks (study sections arrive from localStorage a tick after mount,
 *     a section is renamed, an inline form opens) -> MutationObserver, because a ResizeObserver
 *     on a flex-sized container never fires for its own children's growth
 *   - the reader scrolls -> the listener
 * `measure` is three property reads, and React bails out when the boolean is unchanged, so
 * running it on every mutation is cheaper than being wrong.
 */
function useMoreBelow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 1px of tolerance: fractional layout leaves scrollTop + clientHeight a hair under
    // scrollHeight at the true bottom, which would pin the fade on forever.
    const measure = () => setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return { ref, moreBelow };
}

// ---------------------------------------------------------------------------------------------
// THE NAV TABLES — Sidebar C (owner: "#1 do it", 2026-09-07; canvas board "C · Rail with capped,
// collapsible groups"; test/components/sidebar-groups.test.tsx).
//
// ONE table for the places and ONE for the groups. The full rail, the icon rail and the mobile
// Menu sheet all render from them, so they cannot disagree — two hand-kept copies of a
// destination list is the failure this file has logged sixteen times.
//
// FIVE PLACES NEVER MOVE: Home · Bible · Ask · Desk · Library. Everything that is YOURS is a group.
// Closed, a group is one row. Open, it is its three most recent and a way to all of them — and
// "all of them" is a PAGE, never an inline list of everything (forty threads in a rail is the mess
// this replaces). The group for the page you are on opens by itself; the rest remember how you
// left them (`useRailGroups`). Reading plans, which used to be a sixth place, is a group: a
// schedule over the reading surfaces, not one of them (A072's own comment drew that line). The
// eleven Library rows fold behind the Library place and appear only while you are in the library
// (`LibraryShelves`) — they are shelves you browse, not things of yours.
//
// Before this: five links, Research history (5 threads, a delete control on each), My studies (5),
// Prayer journal, eleven Library rows, Settings — every one of them always visible, nothing
// closable, ~30 rows on a signed-in desktop. Owner: "super clean".
// ---------------------------------------------------------------------------------------------

interface Place {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: (pathname: string) => boolean;
}

/** The five places. `bibleHref` is the reader's remembered position (A034), so this is a function
 *  of it rather than a constant. */
function places(bibleHref: string): Place[] {
  return [
    { href: '/home', label: 'Home', icon: <HomeIcon />, active: (p) => p === '/home' },
    { href: bibleHref, label: 'Bible', icon: <BookIcon />, active: (p) => p.startsWith('/read') },
    { href: '/ask', label: 'Ask', icon: <AskIcon />, active: (p) => p.startsWith('/ask') },
    // `=== '/desk'`, not startsWith: the Desk's state lives in its query string (A072).
    { href: '/desk', label: 'Desk', icon: <DeskIcon />, active: (p) => p === '/desk' },
    { href: '/library', label: 'Library', icon: <BookStackIcon />, active: (p) => p.startsWith('/library') },
  ];
}

type GroupKey = 'research' | 'studies' | 'prayers' | 'works' | 'plans';

interface GroupItem {
  id: string;
  /** `null` renders a plain row: prayers have no per-entry page, and three links that all open
   *  the same journal would be three small lies. */
  href: string | null;
  label: string;
  icon: React.ReactNode;
  /** A short trailing note — a date, a status — in the muted colour. */
  meta?: string;
}

interface GroupDef {
  key: GroupKey;
  label: string;
  icon: React.ReactNode;
  /** The page that lists all of them. `null` for research, which has no list page yet: that ONE
   *  group may unfold further in place (see NavGroup), because threads 4..N would otherwise be
   *  reachable from nowhere. Filed: a research list page, after which this becomes a link. */
  all: { href: string; label: string } | null;
  /** The pages this group belongs to. It opens itself there — and being open THERE is not
   *  remembered, or every group is open within a week and the rail is busy again. */
  owns: (pathname: string) => boolean;
  /** Where a visitor without an account goes instead of a group. `null` = not shown signed out
   *  (a visitor has no research, studies or uploads; they can have a plan or a prayer). */
  signedOut: string | null;
  url: string;
  parse: (body: unknown) => GroupItem[];
  /** Said quietly when the list is empty — never a header over nothing. */
  empty: string;
  /** DELETE one item, resolving to whether it went. Absent = no delete control. */
  remove?: (id: string) => Promise<boolean>;
}

/** Three. The owner said "3-4 max"; three keeps two open groups inside a 768px-tall rail. */
const GROUP_CAP = 3;

/** The most a group fetches. Research needs more than the cap because it unfolds in place; the
 *  API's own ceiling is 50 (`listThreads`). Prayers come whole from `/api/prayers` (≤200, full
 *  bodies) — fetched only when that group is OPENED, never on mount, which is why groups load
 *  lazily at all. A `limit` on that route is filed. */
const RESEARCH_FETCH = 50;

// --- narrowing helpers: the bodies are JSON from our own routes, typed as unknown at the edge ---

function rowsOf(body: unknown, key: string): Record<string, unknown>[] {
  if (typeof body !== 'object' || body === null) return [];
  const v = (body as Record<string, unknown>)[key];
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null);
}

function strOf(r: Record<string, unknown>, k: string): string | null {
  const v = r[k];
  return typeof v === 'string' ? v : null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sun 6" — hand-formatted so it reads the same in every locale and every test. */
function dayStamp(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

/** A prayer has no title; its opening words are its name in the rail. */
function openingWords(body: string, max = 48): string {
  const line = body.trim().split(/\r?\n/)[0] ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

const accentDot = (
  <span className="inline-block h-2 w-2 rounded-full bg-accent-600 dark:bg-accent-400" />
);

const GROUPS: GroupDef[] = [
  {
    key: 'research',
    label: 'Research history',
    icon: <AskIcon />,
    all: null,
    owns: (p) => p.startsWith('/ask'),
    signedOut: null,
    url: `/api/research?limit=${RESEARCH_FETCH}`,
    parse: (body) =>
      rowsOf(body, 'threads').flatMap((r) => {
        const id = strOf(r, 'id');
        const title = strOf(r, 'title');
        return id && title ? [{ id, href: `/ask/${id}`, label: title, icon: accentDot }] : [];
      }),
    empty: 'Nothing yet — the questions you ask collect here.',
    remove: async (id) => {
      const res = await fetch(`/api/research/${id}`, { method: 'DELETE' });
      return res.ok;
    },
  },
  {
    key: 'studies',
    // The user-facing name per owner ruling E1 (2026-08-12); design §7.1.
    label: 'My studies',
    icon: <BookStackIcon />,
    all: { href: '/studies', label: 'All studies' },
    owns: (p) => p.startsWith('/studies') || p.startsWith('/study/'),
    signedOut: null,
    url: '/api/studies',
    parse: (body) => {
      const summaries: StudySummary[] = rowsOf(body, 'studies').flatMap((r) => {
        const id = strOf(r, 'id');
        const title = strOf(r, 'title');
        const updated_at = strOf(r, 'updated_at');
        if (!id || !title || !updated_at) return [];
        return [{ id, title, updated_at, pinned_at: strOf(r, 'pinned_at') }];
      });
      // Pinned first, then recents — the same order the save-to-study picker uses, so the two
      // surfaces never disagree about which studies are "recent".
      return orderStudiesForNav(summaries, GROUP_CAP).map((s) => ({
        id: s.id,
        href: `/studies/${s.id}`,
        label: s.title,
        icon: <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dotColor(s.id) }} />,
      }));
    },
    empty: 'Nothing yet — save a passage or a voice to start one.',
  },
  {
    key: 'prayers',
    // "Prayer journal", per the §2 naming lock (amended 2026-08-08: not "Prayers").
    label: 'Prayer journal',
    icon: <PrayerIcon />,
    all: { href: '/prayers', label: 'All prayers' },
    owns: (p) => p.startsWith('/prayers'),
    signedOut: '/prayers',
    url: '/api/prayers',
    parse: (body) =>
      rowsOf(body, 'prayers').flatMap((r) => {
        const id = strOf(r, 'id');
        const text = strOf(r, 'body');
        if (!id || !text) return [];
        return [{ id, href: null, label: openingWords(text), icon: <PrayerIcon />, meta: dayStamp(strOf(r, 'created_at')) }];
      }),
    empty: 'Nothing yet — your prayers collect here.',
  },
  {
    key: 'works',
    // The label is DERIVED, never typed: the naming lock retires this name as a hand-typed
    // literal in label surfaces, and lib/library-nav is its one source.
    label: libraryLabel('/library/uploads'),
    icon: <BookStackIcon />,
    all: { href: '/library/uploads', label: `All ${libraryLabel('/library/uploads')}` },
    owns: (p) => p.startsWith('/library/uploads'),
    signedOut: null,
    url: '/api/user-corpus/documents',
    parse: (body) =>
      rowsOf(body, 'documents').flatMap((r) => {
        const id = strOf(r, 'id');
        const title = strOf(r, 'title');
        const status = strOf(r, 'status');
        if (!id || !title) return [];
        return [{
          id,
          href: `/library/uploads/${id}`,
          label: title,
          icon: <BookStackIcon />,
          // Only a state worth knowing about rides along; "ready" is the silent default.
          meta: status && status !== 'ready' ? status : undefined,
        }];
      }),
    empty: 'Nothing yet — upload a sermon or a manuscript.',
  },
  {
    key: 'plans',
    label: 'Reading plans',
    icon: <CalendarIcon />,
    all: { href: '/plans', label: 'All plans' },
    owns: (p) => p.startsWith('/plans'),
    signedOut: '/plans',
    url: '/api/plans',
    parse: (body) =>
      rowsOf(body, 'plans').flatMap((r) => {
        const id = strOf(r, 'id');
        const title = strOf(r, 'title');
        return id && title ? [{ id, href: `/plans/${id}`, label: title, icon: <CalendarIcon /> }] : [];
      }),
    empty: 'Nothing yet — start a plan and it appears here.',
  },
];

/** The two groups every visitor can enter, as plain rows for a visitor without an account. */
const VISITOR_ROWS = GROUPS.filter((g): g is GroupDef & { signedOut: string } => g.signedOut !== null);

function railGroupsKey(userId: string): string {
  return `rail-groups:v1:${userId}`;
}

/**
 * Which groups are open, and why. Two layers, deliberately:
 *   stored   — what the reader chose BY HAND on a page the group did not belong to. Persisted.
 *   session  — this visit's overrides, cleared on every navigation so the page's own group
 *              re-opens on arrival even if it was closed a moment ago.
 * open = session ?? (the page owns it || stored). Opening the page's own group is never written
 * to storage: that is the amendment that keeps the rail clean over time.
 *
 * Storage is read in an effect, never during render — reading localStorage during render is the
 * React #418 this file has already paid for twice (the Sign in/out branch, the Bible link).
 */
function useRailGroups(userId: string | undefined, pathname: string) {
  const [stored, setStored] = useState<Partial<Record<GroupKey, boolean>>>({});
  const [session, setSession] = useState<Partial<Record<GroupKey, boolean>>>({});

  useEffect(() => {
    if (!userId) { setStored({}); return; }
    try {
      const raw = localStorage.getItem(railGroupsKey(userId));
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      setStored(typeof parsed === 'object' && parsed !== null ? (parsed as Partial<Record<GroupKey, boolean>>) : {});
    } catch {
      setStored({});
    }
  }, [userId]);

  useEffect(() => { setSession({}); }, [pathname]);

  const isOpen = useCallback(
    (g: GroupDef) => session[g.key] ?? (g.owns(pathname) || stored[g.key] === true),
    [session, stored, pathname],
  );

  const toggle = useCallback(
    (g: GroupDef) => {
      const next = !isOpen(g);
      setSession((s) => ({ ...s, [g.key]: next }));
      if (g.owns(pathname) || !userId) return;
      setStored((prev) => {
        const merged = { ...prev, [g.key]: next };
        try {
          localStorage.setItem(railGroupsKey(userId), JSON.stringify(merged));
        } catch {
          // storage unavailable (private mode); the choice holds for this visit
        }
        return merged;
      });
    },
    [isOpen, pathname, userId],
  );

  return { isOpen, toggle };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

/**
 * One group of yours. Fetches ONLY once it is open (a closed group costs no request — prayers are
 * full texts, and five groups on every mount would be five requests for a rail that shows one).
 * Three honest states once open: loading / could not load / the list. Empty is a quiet line, not
 * a header over nothing.
 */
function NavGroup({
  def,
  open,
  onToggle,
  pathname,
  row,
  touch,
  onNavigate,
}: {
  def: GroupDef;
  open: boolean;
  onToggle: () => void;
  pathname: string;
  row: string;
  touch: boolean;
  onNavigate?: () => void;
}) {
  const [items, setItems] = useState<GroupItem[] | null>(null);
  const [error, setError] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  // Two-step delete, kept from the research-history rows this generalises: the first tap arms
  // the row, the second removes it (PR1c/UX-2 lineage — always visible, never hover-only).
  const [arming, setArming] = useState<string | null>(null);

  useEffect(() => {
    if (!open || items !== null) return;
    let live = true;
    void (async () => {
      try {
        const res = await fetch(def.url);
        if (!live) return;
        // A 401 mid-session (sign-out raced the fetch) is an empty list, not an error — the
        // prayer-journal lesson about auth state versus faults.
        if (res.status === 401) { setItems([]); return; }
        if (!res.ok) { setError(true); setItems([]); return; }
        setItems(def.parse(await res.json()));
      } catch {
        if (live) { setError(true); setItems([]); }
      }
    })();
    return () => { live = false; };
  }, [open, items, def]);

  // OPTIMISTIC WITH ROLLBACK: the row goes at once and comes back if the request fails — a
  // spinner on a delete reads as "did that work?", and a row that stayed gone would be a lie
  // about the account's contents.
  const remove = useCallback(async (id: string) => {
    if (!def.remove) return;
    setArming(null);
    let previous: GroupItem[] | null = null;
    setItems((prev) => { previous = prev; return prev?.filter((i) => i.id !== id) ?? prev; });
    let ok = false;
    try { ok = await def.remove(id); } catch { ok = false; }
    if (!ok) { setItems(previous); setError(true); }
  }, [def]);

  const panelId = `rail-group-${def.key}`;
  const shown = items === null ? null : unfolded ? items : items.slice(0, GROUP_CAP);
  const beyond = items ? Math.max(0, items.length - GROUP_CAP) : 0;
  const quiet = 'px-4 py-1 text-xs text-stone-500 dark:text-stone-400';

  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={`flex w-full items-center gap-2 px-2 text-left text-micro font-semibold uppercase tracking-wider transition-colors ease-gentle ${
          touch ? 'min-h-[44px]' : 'min-h-[36px]'
        } ${
          open
            ? 'text-stone-900 dark:text-stone-200'
            : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
        }`}
      >
        <Chevron open={open} />
        <span className="flex-1 truncate">{def.label}</span>
      </button>
      {open && (
        <div id={panelId}>
          {shown === null ? (
            <p className={quiet}>Loading…</p>
          ) : (
            <>
              {error && <p className={quiet}>Could not be loaded.</p>}
              {shown.length === 0 && !error && <p className={quiet}>{def.empty}</p>}
              {shown.map((it) =>
                it.href === null ? (
                  <div key={it.id} className={`flex items-center gap-2.5 px-2 text-sm text-stone-500 dark:text-stone-400 ${row}`}>
                    <span className="flex w-4 items-center justify-center">{it.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.meta && <span className="shrink-0 text-micro text-stone-400 dark:text-stone-500">{it.meta}</span>}
                  </div>
                ) : def.remove ? (
                  <div key={it.id} className="relative flex items-center">
                    <div className="min-w-0 flex-1">
                      <SidebarLink href={it.href} icon={it.icon} label={it.label} active={pathname === it.href} row={row} onNavigate={onNavigate} />
                    </div>
                    <button
                      type="button"
                      onClick={() => (arming === it.id ? void remove(it.id) : setArming(it.id))}
                      onBlur={() => setArming((cur) => (cur === it.id ? null : cur))}
                      aria-label={arming === it.id ? `Confirm delete: ${it.label}` : `Delete research thread: ${it.label}`}
                      className={`mr-1 shrink-0 px-2 py-1 text-micro transition-colors ease-gentle ${
                        arming === it.id
                          ? 'font-semibold text-red-700 dark:text-red-400'
                          : 'text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200'
                      }`}
                    >
                      {arming === it.id ? 'Delete?' : '×'}
                    </button>
                  </div>
                ) : (
                  <div key={it.id} className="flex items-center">
                    <div className="min-w-0 flex-1">
                      <SidebarLink href={it.href} icon={it.icon} label={it.label} active={pathname === it.href} row={row} onNavigate={onNavigate} tier="shelf" />
                    </div>
                    {it.meta && <span className="mr-2 shrink-0 text-micro text-stone-400 dark:text-stone-500">{it.meta}</span>}
                  </div>
                ),
              )}
              {def.all && (
                <SidebarLink
                  href={def.all.href}
                  icon={<span aria-hidden className="inline-block w-2" />}
                  label={`${def.all.label} →`}
                  active={pathname === def.all.href}
                  row={row}
                  onNavigate={onNavigate}
                  tier="shelf"
                />
              )}
              {!def.all && beyond > 0 && (
                <button
                  type="button"
                  onClick={() => setUnfolded((v) => !v)}
                  className={`flex w-full items-center gap-2.5 px-2 text-left text-sm text-accent-700 transition-colors ease-gentle hover:text-stone-900 dark:text-accent-400 dark:hover:text-stone-200 ${row}`}
                >
                  <span aria-hidden className="inline-block w-4" />
                  <span className="flex-1 truncate">{unfolded ? 'Fewer' : `More research · ${beyond}`}</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The shelves, shown only while you are in the library. The corpus hub used to be UNREACHABLE
 * (no `a[href="/library"]` anywhere in the shell — ship-committee LENS 1, BROKEN #1); the Library
 * place above fixes that for every page, and this block is the browse once you are there.
 *
 * DERIVED from CATALOG_IDS, not typed out: adding the Historians catalog on 2026-08-01 shipped a
 * shelf nothing linked to — the ELEVENTH "hand-maintained expected set that nothing enforces".
 * `sidebar-catalog-nav.test.tsx` fails if any catalog has no link.
 */
function LibraryShelves({
  pathname,
  row,
  onNavigate,
}: {
  pathname: string;
  row: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="mt-3 border-t border-stone-50 pt-2 dark:border-stone-800">
      <div className="mb-1 px-4">
        <span className="text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          In the library
        </span>
      </div>
      <SidebarLink href="/library" icon={<BookStackIcon />} label="All items" active={pathname === '/library'} row={row} onNavigate={onNavigate} tier="shelf" />
      {CATALOG_IDS.map((id) => (
        <SidebarLink
          key={id}
          href={`/library/${id}`}
          icon={CATALOG_ICON[id] ?? <QuoteIcon />}
          label={CATALOGS[id].label}
          active={pathname.startsWith(`/library/${id}`)}
          row={row}
          tier="shelf"
          onNavigate={onNavigate}
        />
      ))}
      {/* The passage-by-passage browse. Kept linked: moving it off /library/commentaries would
          otherwise orphan a working surface (LIBRARY_READER_DESIGN §18). */}
      <SidebarLink href="/library/passages" icon={<QuoteIcon />} label={libraryLabel('/library/passages')} tier="shelf" active={pathname.startsWith('/library/passages')} row={row} onNavigate={onNavigate} />
      <SidebarLink href="/library/notes" icon={<BookStackIcon />} label={libraryLabel('/library/notes')} tier="shelf" active={pathname.startsWith('/library/notes')} row={row} onNavigate={onNavigate} />
      <SidebarLink href="/library/word-study" icon={<LanguagesIcon />} label={libraryLabel('/library/word-study')} tier="shelf" active={pathname.startsWith('/library/word-study')} row={row} onNavigate={onNavigate} />
      <SidebarLink href="/library/uploads" icon={<BookStackIcon />} label={libraryLabel('/library/uploads')} tier="shelf" active={pathname.startsWith('/library/uploads')} row={row} onNavigate={onNavigate} />
    </div>
  );
}

// Shared nav content, rendered inside the desktop rail and the mobile menu
// sheet. `touch` widens rows to comfortable tap-target sizes; `onNavigate`
// lets the mobile sheet close itself after a link is chosen.
export function SidebarNavContent({
  touch = false,
  onNavigate,
}: {
  touch?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // A034 — the Bible link went to John 1 unconditionally, discarding the reader's position. This
  // component feeds BOTH the desktop rail and MobileNav's Menu sheet (mobile-nav.tsx:182), so the
  // hardlink here was the phone user's second route to the old behaviour even after the bottom tab
  // was fixed. Seeded with the DEFAULT so the first client render matches the server's (reading
  // localStorage during render is the React #418 this repo has paid for twice), and keyed on
  // `pathname` rather than `[]` because the rail stays mounted across client navigations and a
  // one-shot effect would freeze at boot.
  const [bibleHref, setBibleHref] = useState(DEFAULT_BIBLE_HREF);
  useEffect(() => setBibleHref(bibleTabHref()), [pathname]);
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  // THE SERVER HAS NO SESSION, so it renders the signed-OUT branch; `useSession` resolves only in
  // the browser. Rendering the signed-IN branch on the client's first pass is a server/client
  // text mismatch — a React #418 on every page load carrying this sidebar, which is every page.
  // `mounted` holds the first client render identical to the server's; the real session takes
  // over on the next one. That is why the groups (signed-in only) also key off `signedIn`.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const signedIn = mounted && !!session?.user;
  const [sections, setSections] = useState<StudySection[] | null>(null);
  // B044 — Sign out arms on the first tap and fires on the second. The authenticated QA fleet's
  // one BLOCKER was an accidental sign-out from inside the Menu sheet: the sheet slides up UNDER
  // the finger, so a habitual second tap lands on whatever row is transiting — and Sign out was a
  // single-tap row styled like the links around it. Disarms on blur so an armed row cannot lie
  // in wait.
  const [signOutArmed, setSignOutArmed] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const groups = useRailGroups(userId, pathname);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      setSections(raw ? (JSON.parse(raw) as StudySection[]) : SEED_SECTIONS);
    } catch {
      setSections(SEED_SECTIONS);
    }
  }, [userId]);

  const save = useCallback(
    (next: StudySection[]) => {
      setSections(next);
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(next));
      } catch {
        // storage unavailable (private mode); keep in-memory state
      }
    },
    [userId],
  );

  const row = touch ? 'min-h-[44px] py-2.5' : 'py-1.5';
  const { ref: navRef, moreBelow } = useMoreBelow<HTMLElement>();

  return (
    <>
      <nav
        ref={navRef}
        className={`flex-1 overflow-y-auto px-2 py-3 ${moreBelow ? 'scroll-fade-b' : ''}`}
      >
        {/* The five places */}
        <div className="mb-1 px-2">
          {places(bibleHref).map((p) => (
            <SidebarLink
              key={p.label}
              href={p.href}
              icon={p.icon}
              label={p.label}
              active={p.active(pathname)}
              row={row}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {pathname.startsWith('/library') && (
          <LibraryShelves pathname={pathname} row={row} onNavigate={onNavigate} />
        )}

        {/* Yours. Internal rail rule: parchment-on-vellum, not .edge (see the settings block). */}
        <div className="mt-3 border-t border-stone-50 px-2 pt-2 dark:border-stone-800">
          {signedIn
            ? GROUPS.map((g) => (
                <NavGroup
                  key={g.key}
                  def={g}
                  open={groups.isOpen(g)}
                  onToggle={() => groups.toggle(g)}
                  pathname={pathname}
                  row={row}
                  touch={touch}
                  onNavigate={onNavigate}
                />
              ))
            : VISITOR_ROWS.map((g) => (
                <SidebarLink
                  key={g.key}
                  href={g.signedOut}
                  icon={g.icon}
                  label={g.label}
                  active={pathname.startsWith(g.signedOut)}
                  row={row}
                  onNavigate={onNavigate}
                />
              ))}
        </div>

        {/* Study sections (user-defined parent/child) — legacy, pre-N4; see StudySectionView. */}
        {sections?.map((section) => (
          <StudySectionView
            key={section.id}
            section={section}
            pathname={pathname}
            row={row}
            onNavigate={onNavigate}
            onRename={(name) =>
              save(sections.map((s) => (s.id === section.id ? { ...s, name } : s)))
            }
          />
        ))}
      </nav>

      {/* Bottom: settings and the account. NOT .edge: on the rail's vellum surface the edge
          hairline is vellum-on-vellum (invisible), so internal rail rules use parchment on
          vellum, the way the mockup's vellum commentary aside uses a white/20 rule. */}
      <div className="border-t border-stone-50 px-2 py-2 dark:border-stone-800">
        <SidebarLink
          href="/settings"
          icon={<SettingsIcon />}
          label="Settings"
          active={pathname === '/settings'}
          row={row}
          onNavigate={onNavigate}
        />
        {signedIn ? (
          <SidebarButton
            icon={<LogOutIcon />}
            label={signOutArmed ? 'Sign out?' : 'Sign out'}
            row={row}
            onBlur={() => setSignOutArmed(false)}
            // A failed sign-out used to navigate to '/' anyway, leaving the reader on the
            // marketing page still authenticated while believing they had signed out. On a
            // shared device that is a false security signal, which is worse than an error.
            onClick={async () => {
              // First tap arms (B044); the second, while armed, signs out.
              if (!signOutArmed) { setSignOutArmed(true); setSignOutError(null); return; }
              setSignOutArmed(false);
              // Better Auth's own client, not a hand-rolled POST. The route that used to serve
              // this cleared `__Secure-neon-auth*` cookies -- the wrong cookie family now -- and
              // it sat at /api/auth/sign-out, SHADOWING the catch-all handler Better Auth mounts
              // there. It is deleted; this is the supported path.
              //
              // The failure branch is main's and is kept: signOut() can reject, and a sign-out
              // that quietly does nothing while the reader believes they are signed out is the
              // worst outcome on a shared machine.
              try {
                const { error } = await authClient.signOut();
                if (error) throw new Error(error.message ?? 'sign-out failed');
                window.location.href = '/';
              } catch {
                setSignOutError('Sign out failed. You are still signed in. Please try again.');
              }
            }}
          />
        ) : (
          <SidebarLink
            href="/auth/sign-in"
            icon={<UserIcon />}
            label="Sign in"
            active={pathname.startsWith('/auth')}
            row={row}
            onNavigate={onNavigate}
          />
        )}
        {signOutError && (
          <p role="alert" className="px-4 py-1 text-xs text-red-800 dark:text-red-200">
            {signOutError}
          </p>
        )}
      </div>
    </>
  );
}

/**
 * Per-catalog icon. A MAP with a fallback, not a switch: a catalog with no icon yet still gets a
 * link (the fallback), because an orphaned shelf is a real bug and a generic glyph is not.
 */
// ONE ICON PER SHELF. This map used to define a single entry (a `♪` text glyph for
// Hymns) and let everything else fall through to <QuoteIcon />, so Commentaries,
// Sermons, Historians, Devotionals and Theology & Creeds all wore the SAME speech
// bubble. Five identical icons in a six-item list is worse than no icons: the eye
// learns they carry nothing and stops reading them, and the one entry that differed
// did so by being a text character at a different optical weight to its neighbours.
//
// Each shelf now has its own mark, drawn to this file's convention (24 viewBox,
// strokeWidth 1.5, h-4 w-4) so they sit on the same optical line as the nav icons above.
const CATALOG_ICON: Partial<Record<CatalogId, React.ReactNode>> = {
  commentaries: <QuoteIcon />,
  sermons: <LecternIcon />,
  'hymns-poetry': <NoteIcon />,
  historians: <ScrollIcon />,
  devotionals: <SunriseIcon />,
  theology: <TabletIcon />,
};

/**
 * A093 — THE WIDTH BAND THAT GETS THE ICON RAIL INSTEAD OF THE 256px SIDEBAR.
 *
 * The 2026-08-16 QA fleet filed it as "no dedicated tablet nav treatment — 768px renders the full
 * 256px desktop sidebar with full text labels (consuming a third of the screen); one pixel
 * narrower flips entirely to the phone bottom-nav layout". Both halves check out in the source:
 * `mobile-nav.tsx:93` is `md:hidden` and this file's `<aside>` is `hidden … md:flex`, so 767px and
 * 768px are two completely different navigations with nothing between them.
 *
 * THE BOUNDS ARE THE ONES ALREADY IN THE BUILD, not a new breakpoint. `768px` is Tailwind's `md`,
 * the exact pixel the bottom tab bar hands over at; `1023.98px` is the last width below `lg`,
 * where the viewport is wide enough that 256px of chrome stops being a third of it. Widening this
 * band is a design decision, not a tidy-up — a desktop reader must never boot collapsed.
 *
 * Written as a media query rather than a `window.innerWidth` read on purpose: the browser owns the
 * definition of "how wide am I" (zoom, device pixel ratio, scrollbar gutters all move it), and a
 * media query is the same arithmetic the stylesheet next door is already doing.
 */
// The band's floor is `md` (768px), NOT `sm` (640px), and the difference is load-bearing rather
// than cosmetic. This `<aside>` is `hidden … md:flex` and mobile-nav is `md:hidden`, so below 768px
// the rail does not render at all and the reader has the bottom tab bar instead. A floor of 640px
// therefore set `collapsed` across a range where the sidebar is invisible — harmless on screen,
// but it means a phone rotated up into tablet width arrives already collapsed, having never been
// shown the choice. Caught by this change's own test ("does not fire on the phone side of the
// cliff"), which asserted 767px and went red against the 640px floor.
// CEILING CORRECTED 2026-08-17 (pre-deploy audit). It read `1279.98px` — Tailwind's `xl` — while
// the block above states the bound as `1023.98px`, "the last width below `lg`", and states the
// invariant "a desktop reader must never boot collapsed". The constant contradicted both by 256px,
// so every laptop window from 1024px to 1279.98px — the commonest desktop browser-window band —
// booted into the 48px rail, where the only destinations are the 7 icon links: no Desk, no catalog
// shelves, no My Studies, no Research history, no Sign in. The suite could not see it because the
// test asserted 768 and 1280 and nothing in between.
const TABLET_MEDIA_QUERY = '(min-width: 768px) and (max-width: 1023.98px)';

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // A093 — A TABLET BOOTS INTO THE RAIL. This is the whole treatment: no new breakpoint system,
  // no third layout, just the collapse this component already had, defaulted ON inside the band
  // above. The chevron is untouched, so it stays a DEFAULT and not a lockout.
  //
  // `false` REMAINS THE INITIAL STATE and the query is read in an effect, never during render.
  // Reading it during render would make the first client pass disagree with the server's (which
  // has no viewport at all) — the React #418 this file has already paid for twice, once on the
  // Sign in/Sign out branch below and once on the Bible link. The cost of doing it correctly is
  // one frame of the wide sidebar on a tablet before it collapses; the cost of doing it the other
  // way is a hydration error on every page load in the app.
  //
  // IT LISTENS FOR `change`, NOT FOR EVERY RESIZE, and the difference is the reader's own choice:
  // a `change` fires only when the answer FLIPS, so expanding the rail and then resizing within
  // the band leaves it expanded, while crossing out of the band (rotation, a window dragged wider)
  // applies the default for the layout the reader has actually moved to.
  useEffect(() => {
    const tablet = window.matchMedia(TABLET_MEDIA_QUERY);
    setCollapsed(tablet.matches);
    const onCross = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    tablet.addEventListener('change', onCross);
    return () => tablet.removeEventListener('change', onCross);
  }, []);

  // A034 — the writing rail's own Bible link. Same hardlink, same fix, its own state because this
  // is a different component from SidebarNavContent and the value cannot be shared without lifting
  // it. Seeded with the DEFAULT for the same hydration reason.
  const [bibleHref, setBibleHref] = useState(DEFAULT_BIBLE_HREF);
  useEffect(() => setBibleHref(bibleTabHref()), [pathname]);
  // WRITING MODE (owner direction 2026-08-12, journal-redesign mockup): while the prayer compose
  // view owns the screen, the 256px sidebar drops to a 58px icon rail — the journal area is the
  // screen, not a widget on it. The rail re-expands on hover or ⌘\, and collapses again when the
  // pointer leaves. The signal comes from `lib/prayer-writing-mode.ts`.
  const [writing, setWriting] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  useEffect(() => {
    const sync = () => setWriting(isPrayerWriting());
    sync();
    window.addEventListener(PRAYER_WRITING_EVENT, sync);
    return () => window.removeEventListener(PRAYER_WRITING_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!writing) { setRailOpen(false); return; }
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === '\\') { e.preventDefault(); setRailOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [writing]);

  // A095 — THE COLLAPSE CHEVRON'S NAME AND TOOLTIP, FROM ONE BINDING.
  //
  // The 2026-08-17 QA pass filed this control as "an unlabeled, undiscoverable chevron with no
  // tooltip". HALF OF THAT WAS ALREADY FALSE and it is worth saying, because it changes the fix:
  // both branches below already carried a state-correct `aria-label` ("Expand sidebar" when
  // collapsed, "Collapse sidebar" when open), and `sidebar-writing-rail.test.tsx` has queried the
  // full nav BY that name since 2026-08-12. A screen reader was never the reader left guessing.
  //
  // What was true is that a SIGHTED reader was. The two states render as bare `>` and `<` strokes
  // with no `title`, so hovering the chevron said nothing at all — the same shape as UX-2, where an
  // affordance's only explanation lived somewhere the person looking at it never went. The rail's
  // own icon-only links (`railLinks` above) already set `aria-label` AND `title` together for
  // exactly this reason; this control was the one icon-only button in the file that did not.
  //
  // ONE BINDING, DERIVED FROM `collapsed`, spent on both attributes in both branches. Two
  // hand-typed strings per branch is how a tooltip ends up disagreeing with the accessible name,
  // and a fixed string across branches is how a control ends up announcing "Collapse" while it
  // expands — which is the bookmark control's B023 defect ("Bookmark" whether or not the verse was
  // bookmarked) in a different corner of the app. Derived, it cannot drift either way.
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  // The pre-launch password gate stands alone — no app chrome around it.
  if (pathname === '/gate') return null;

  if (writing && !railOpen) {
    return (
      <aside
        aria-label="Navigation"
        onMouseEnter={() => setRailOpen(true)}
        className="hidden w-[58px] flex-col items-center gap-1 border-r edge bg-stone-200 py-4 md:flex dark:bg-stone-900"
      >
        <IconRailLinks pathname={pathname} bibleHref={bibleHref} />
      </aside>
    );
  }

  if (collapsed) {
    return (
      // A093 — THE COLLAPSED RAIL CARRIES DESTINATIONS NOW, and that is a precondition of the
      // tablet default above rather than a bonus. Until this change the collapsed state was a
      // 48px strip holding exactly ONE control: the chevron that undoes it. On desktop that is
      // the reader's own choice and one click from reversible. As a tablet DEFAULT it would have
      // been a screen with no navigation on it at all — the rail empty AND `mobile-nav.tsx`'s
      // bottom tab bar absent, because that bar is `md:hidden`.
      //
      // Same list as the writing-mode rail, from `IconRailLinks` — one source, because two
      // hand-kept copies of a destination list is the failure this repo has now logged sixteen
      // times. Landmark named to match that rail for the same reason: at tablet width this IS the
      // navigation, and an unnamed `complementary` region is not something a screen-reader user
      // can jump to.
      <aside
        aria-label="Navigation"
        className="hidden w-12 flex-col items-center gap-1 border-r edge bg-stone-200 py-3 md:flex dark:bg-stone-900"
      >
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 text-stone-500 transition-colors ease-gentle hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          <svg aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <IconRailLinks pathname={pathname} bibleHref={bibleHref} />
      </aside>
    );
  }

  return (
    <aside
      // In writing mode this expanded state is the rail's hover/⌘\ overlay: leaving it puts the
      // rail back. Outside writing mode there is no rail, so there is nothing to restore.
      onMouseLeave={writing ? () => setRailOpen(false) : undefined}
      className="hidden w-64 flex-col border-r edge bg-stone-200 md:flex dark:bg-stone-900"
    >
      {/* Header. Internal rail rule: parchment-on-vellum, not .edge (see the settings block). */}
      <div className="flex items-center justify-between border-b border-stone-50 px-4 py-3 dark:border-stone-800">
        {/* PRD §6: wordmark is EB Garamond 18px/500, ink. */}
        <Link href="/home" className="font-display text-[18px] font-medium tracking-[-0.01em] text-stone-900 dark:text-stone-200">
          Ancient Paths
        </Link>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 text-stone-500 transition-colors ease-gentle hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
      <SidebarNavContent />
    </aside>
  );
}

function StudySectionView({
  section,
  pathname,
  row,
  onNavigate,
  onRename,
}: {
  section: StudySection;
  pathname: string;
  row: string;
  onNavigate?: () => void;
  onRename: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="group mt-4">
      <div className="mb-1 flex items-center justify-between px-4">
        {renaming ? (
          <InlineNameForm
            initial={section.name}
            placeholder="section name"
            onSubmit={(name) => {
              onRename(name);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            <span className="truncate text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              {section.name}
            </span>
            {/* 2026-08-11 (owner): the `+` created items that led NOWHERE — every item resolves
                to /prayers, and only the PR1a-migrated legacy items genuinely live there.
                Creating an inert name was a fake door (owner: "making new works under those
                tabs do nothing"), so the affordance is removed until study spaces are built.
                Rename stays: it edits what already exists. */}
            <span className="flex items-center gap-0.5 opacity-100 transition-opacity ease-gentle [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
              <button
                onClick={() => setRenaming(true)}
                className="p-1.5 text-stone-500 transition-colors ease-gentle hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                aria-label={`Rename ${section.name}`}
              >
                <PencilIcon />
              </button>
            </span>
          </>
        )}
      </div>
      {section.items.length === 0 && <SectionEmptyState id={section.id} />}
      {section.items.map((item) => {
        // PR1c item 1. These items belong to sections a reader created before `N4` retired the
        // concept, and BOTH old destinations are dead: `/channel/[id]` redirects to `/prayers`,
        // and `/study/[id]` is still a `ComingSoon` placeholder — the same fake door `N4` closed,
        // one branch of this ternary over.
        //
        // They resolve to `/prayers` rather than being made inert, because that is TRUE and not
        // merely convenient: `PR1a`'s first-launch carry-forward already migrated these items into
        // the prayer journal, so the journal genuinely contains what the reader is clicking.
        return (
          <SidebarLink
            key={item.id}
            href="/prayers"
            icon={
              // The `#` glyph was the channel concept's; it is retired with it.
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: dotColor(item.id) }}
              />
            }
            label={item.name}
            active={pathname === href}
            row={row}
            onNavigate={onNavigate}
          />
        );
      })}
    </div>
  );
}

/**
 * What an empty study section actually says.
 *
 * It used to say "Nothing here yet" for every section, which names the state and explains
 * nothing: a reader looking at CHANNELS / STUDY PARTNERS on the Home rail has no way to learn
 * what either one IS. Reading Plans' empty state is the standard in this app — it explains the
 * three plan types with examples before asking for anything — and this is that pattern at rail
 * scale.
 *
 * IT ALSO HAS TO BE HONEST. `/channel/[id]` and `/study/[id]` are both `ComingSoon` stubs, so
 * an empty state that says "add one to get started" would be walking the reader into a dead
 * end — worse than the bare line it replaces. The copy below is drawn from those two pages'
 * own descriptions and says plainly that the thing is not built. The seeded sections are
 * matched by ID, not by `kind`: a section the reader creates themselves is also `kind:'group'`
 * and must NOT inherit Study Partners' copy.
 */
function SectionEmptyState({ id }: { id: string }) {
  const copy =
    id === 'channels'
      ? 'Group study spaces — a class or cohort working through a passage together. Being built.'
      : id === 'partners'
        ? 'A space of your own for each sermon or class, with your notes kept together. Being built.'
        : 'Empty. Study sections fill in when study spaces are built.';
  return (
    <p className="px-4 py-1 pb-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
      {copy}
    </p>
  );
}

function InlineNameForm({
  initial = '',
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const commit = () => {
    const name = value.trim();
    if (name) onSubmit(name);
    else onCancel();
  };
  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        // PRD §6 input: parchment, 1px hairline, square. `.edge` carries the hairline (a
        // focus:border-* utility would lose to it — .edge is unlayered), so focus is shown
        // by the global gold focus-visible ring instead of a border colour flip.
        className="w-full border edge bg-paper px-2 py-1.5 text-base text-stone-900 placeholder:text-stone-500 sm:py-1 sm:text-sm dark:bg-stone-950 dark:text-stone-200 dark:placeholder:text-stone-400"
        autoFocus
      />
    </form>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  active,
  row = 'py-1.5',
  onNavigate,
  tier = 'primary',
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  row?: string;
  onNavigate?: () => void;
  /** `primary` = a destination (Bible, Ancient Paths, Reading plans). `shelf` = one of the
   *  nine library catalogues, which are a list you scan rather than places you go. The rail
   *  used to render all fifteen at one weight, one size and one colour, which is what made it
   *  read as an admin panel bolted to a reader. */
  tier?: 'primary' | 'shelf';
}) {
  return (
    // PRD quiet-rail link (mockup top-nav treatment): no background fills, no radius —
    // ink-wash text that darkens to ink on hover; the active row is ink with a 1px rule
    // under the LABEL (the mockup's active-link border-b), not a filled row.
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 px-2 transition-colors ease-gentle ${row} ${
        tier === 'primary' ? 'text-sm font-medium' : 'text-sm'
      } ${
        active
          ? 'font-medium text-stone-900 dark:text-stone-200'
          : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
      }`}
    >
      <span className="flex w-4 items-center justify-center text-sm">{icon}</span>
      {/* border-transparent reserves the rule's 1px in every state, so the active
          underline appearing doesn't shift the row's baseline. */}
      <span
        className={`flex-1 truncate border-b pb-0.5 ${
          active ? 'border-stone-900 dark:border-stone-200' : 'border-transparent'
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

/**
 * THE ICON RAIL'S DESTINATIONS — rendered by BOTH narrow rails (writing mode, and the collapsed
 * rail a tablet boots into).
 *
 * DERIVED, since Sidebar C: the five places from `places()` (one table with the full rail, so the
 * rails cannot drift), then the two groups every visitor can enter — the journal, because the
 * writing-mode rail exists precisely while a prayer is being composed and must still reach it,
 * and Reading plans, which was a place until C — then Settings. The narrower rail offers only the
 * places a reader might actually leave for; adding one is a design decision, not a sync task.
 *
 * `test/components/sidebar-tablet-default.test.tsx` asserts the two rails still match by
 * rendering both and comparing. Every link carries `aria-label` AND `title` from one binding, so
 * the tooltip and the accessible name cannot disagree (A095).
 */
function IconRailLinks({ pathname, bibleHref }: { pathname: string; bibleHref: string }) {
  const links: Place[] = [
    ...places(bibleHref),
    { href: '/prayers', label: 'My prayers', icon: <PrayerIcon />, active: (p) => p.startsWith('/prayers') },
    { href: '/plans', label: 'Reading plans', icon: <CalendarIcon />, active: (p) => p.startsWith('/plans') },
    { href: '/settings', label: 'Settings', icon: <SettingsIcon />, active: (p) => p === '/settings' },
  ];
  return (
    <>
      {links.map((l) => {
        const active = l.active(pathname);
        return (
          <Link
            key={l.label}
            href={l.href}
            aria-label={l.label}
            title={l.label}
            className={`flex h-9 w-9 items-center justify-center transition-colors ease-gentle ${
              active
                ? 'text-stone-900 dark:text-stone-200'
                : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            {l.icon}
          </Link>
        );
      })}
    </>
  );
}

function SidebarButton({
  icon,
  label,
  row = 'py-1.5',
  onClick,
  onBlur,
}: {
  icon: React.ReactNode;
  label: string;
  row?: string;
  onClick: () => void;
  /** B044: lets an armed two-step control disarm when focus leaves it. */
  onBlur?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onBlur={onBlur}
      className={`flex w-full items-center gap-2.5 px-2 text-sm text-stone-500 transition-colors ease-gentle hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 ${row}`}
    >
      <span className="flex w-4 items-center justify-center text-sm">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
    </button>
  );
}

// --- shelf marks. All 24-viewBox, strokeWidth 1.5, h-4 w-4, matching the nav icons. ---

/** A lectern: preached expositions. */
function LecternIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 4h14l-2 5H7L5 4zm7 5v11m-4 0h8" />
    </svg>
  );
}

/** A beamed note: hymns and sacred poetry. Replaces a `♪` text character. */
function NoteIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 18V6l11-2v12M9 18a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm11-2a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
    </svg>
  );
}

/** Hands together — the prayer journal (N4/PR1a). Deliberately not a chat bubble: the section it
 *  replaced was a study-assistant shell, and reusing that icon would carry the retired concept
 *  into the surface that supersedes it. */
function PrayerIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v9m0 0c0 3 2 5 4 6H8c2-1 4-3 4-6zM9 6.5C9 5 10 4 10 4M15 6.5C15 5 14 4 14 4" />
    </svg>
  );
}

/** A scroll: the historians. */
function ScrollIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 4h11a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2zm2 5h7M8 13h7M8 17h4" />
    </svg>
  );
}

/** A sun over the horizon: morning and evening devotions. */
function SunriseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 18h18M8 18a4 4 0 018 0M12 4v3m-6 3L4.5 8.5M18 10l1.5-1.5" />
    </svg>
  );
}

/** Two tablets: theology and the creeds. */
function TabletIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8a3 3 0 013-3h1a3 3 0 013 3v12H4V8zm9 0a3 3 0 013-3h1a3 3 0 013 3v12h-7V8z" />
    </svg>
  );
}

/** An aleph-and-alpha pairing rendered as a mark rather than as the literal
 *  characters `אα`, which sat in the icon slot at text weight and were read aloud
 *  by screen readers as part of the link name. */
function LanguagesIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6h8M7 6v10m-3 0h6M14 18l3.5-9 3.5 9m-6-3h5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function AskIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.13L3 21l1.87-6.4A8 8 0 1121 12z" />
    </svg>
  );
}

/** A pane divided into three columns — what the Desk LOOKS like. The desk itself outgrew the
 *  three-pane row (UX-3: a grid of up to 4x4, `MAX_PANES` = 16); the glyph stays, because three
 *  columns is still what panes read as at icon size and a 4x4 waffle would read as a calendar.
 *
 *  Drawn rather than reused, for the reason CATALOG_ICON's comment gives one screen up: five
 *  identical speech bubbles taught the eye that these glyphs carry nothing. BookStackIcon (the
 *  Library) and TabletIcon (Theology) were the near neighbours and both would have said the wrong
 *  thing — the Desk is not a shelf and not a work. Same convention as every icon in this file:
 *  24 viewBox, strokeWidth 1.5, h-4 w-4, so it sits on the nav's optical line. */
function DeskIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM9 5v14M15 5v14" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function BookStackIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function QuoteIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
