'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { isPrayerWriting, PRAYER_WRITING_EVENT } from '@/lib/prayer-writing-mode';
import { CATALOGS, CATALOG_IDS, type CatalogId } from '@/lib/catalog-defs';
import { orderStudiesForNav, type StudySummary } from '@/components/save-to-study';

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
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  // See the sign-in/sign-out branch below: this exists solely to keep the first client render
  // identical to the server's.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [sections, setSections] = useState<StudySection[] | null>(null);

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
        {/* Quick links */}
        <div className="mb-1 px-2">
          <SidebarLink
            href="/home"
            icon={<HomeIcon />}
            label="Home"
            active={pathname === '/home'}
            row={row}
            onNavigate={onNavigate}
          />
          <SidebarLink
            href="/read/jhn/1"
            icon={<BookIcon />}
            label="Bible"
            active={pathname.startsWith('/read')}
            row={row}
            onNavigate={onNavigate}
          />
          <SidebarLink
            href="/ask"
            icon={<AskIcon />}
            label="Ancient Paths"
            active={pathname.startsWith('/ask')}
            row={row}
            onNavigate={onNavigate}
          />
          <SidebarLink
            href="/plans"
            icon={<CalendarIcon />}
            label="Reading plans"
            active={pathname.startsWith('/plans')}
            row={row}
            onNavigate={onNavigate}
          />
          {/* THE SERVER HAS NO SESSION, so it renders the signed-OUT branch; `useSession` resolves
              only in the browser. Rendering the signed-IN branch on the client's first pass is a
              server/client text mismatch ("Sign in" vs "Sign out") — a React #418 on every page
              load carrying this sidebar, which is every page. Found by the A7b walk 2026-08-02.
              `mounted` holds the first client render identical to the server's; the real session
              takes over on the next one. The alternative — rendering nothing until mounted — is
              the SAME bug, because the server still rendered a link. */}
          {mounted && session?.user ? (
            <SidebarButton
              icon={<LogOutIcon />}
              label="Sign out"
              row={row}
              // A failed sign-out used to navigate to '/' anyway, leaving the reader on the
              // marketing page still authenticated while believing they had signed out. On a
              // shared device that is a false security signal, which is worse than an error.
              onClick={async () => {
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
                  alert('Sign out failed. You are still signed in. Please try again.');
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
        </div>

        {/* RESEARCH HISTORY (ASK_HISTORY_DESIGN §4.6, built 2026-08-16): recent threads,
            then /ask as "All research". Fetch-backed and signed-in only, for the same
            reason as MY STUDIES below — a signed-out visitor has no history, and an empty
            shelf or an auth-error line would be worse than nothing. */}
        {mounted && session?.user && (
          <ResearchHistory pathname={pathname} row={row} onNavigate={onNavigate} />
        )}

        {/* MY STUDIES (design §7.1; the user-facing name per owner ruling E1, 2026-08-12):
            pinned studies first, then updated_at recents, then "All studies". This is the
            rail's first FETCH-BACKED section — everything above is static links or
            localStorage seeds — so it renders only for a signed-in reader (a signed-out
            visitor HAS no studies; showing the section would be an empty shelf or, worse,
            an error line reporting the app's own auth state as a fault — the prayer-journal
            lesson). Loading and failure are stated honestly and quietly, and "All studies"
            stays reachable in every state. The writing-mode rail above is deliberately NOT
            updated: its comment makes any addition there its own design decision. */}
        {mounted && session?.user && (
          <MyStudies pathname={pathname} row={row} onNavigate={onNavigate} />
        )}

        {/* PRAYER JOURNAL — N4's repurposing of CHANNELS, pointing at the shipped PR1a surface.
            The block allows exactly two states for this section, the real journal or nothing, and
            says so in terms: "No third state." */}
        <div className="mt-4">
          <div className="mb-1 px-4">
            <span className="text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Prayer journal
            </span>
          </div>
          <SidebarLink
            href="/prayers"
            icon={<PrayerIcon />}
            label="My prayers"
            active={pathname.startsWith('/prayers')}
            row={row}
            onNavigate={onNavigate}
          />
        </div>

        {/* Study sections (user-defined parent/child) */}
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

        {/* Library */}
        <div className="mt-4">
          <div className="mb-1 px-4">
            <span className="text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Library
            </span>
          </div>
          {/* The corpus hub. Was UNREACHABLE: no `a[href="/library"]` existed anywhere
              in the shell, so the Library hub, every catalog and every /work/<slug>
              Book Reader page could only be reached by typing a URL (ship-committee
              LENS 1, BROKEN #1). The nav item labelled "Library" pointed at
              /library/commentaries — which was then shadowed by the passage-browse
              page and never rendered the catalog (BROKEN #2, now resolved: the browse
              moved to /library/passages per LIBRARY_READER_DESIGN §18). */}
          <SidebarLink
            href="/library"
            icon={<BookStackIcon />}
            label="All items"
            active={pathname === '/library'}
            row={row}
            onNavigate={onNavigate}
          />
          {/* DERIVED from CATALOG_IDS, not typed out. These three links used to be hardcoded, so
              adding the Historians catalog on 2026-08-01 shipped a shelf with works on it that
              nothing in the shell linked to — the ELEVENTH instance of "a hand-maintained expected
              set that nothing enforces", and the same orphaning the comment above records for the
              Library hub itself. Now a new catalog appears here by existing.
              `sidebar-catalog-nav.test.ts` fails if any catalog has no link. */}
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
          {/* The passage-by-passage browse/search. Kept linked: moving it off
              /library/commentaries would otherwise orphan a working surface —
              the same failure this block exists to fix. */}
          <SidebarLink
            href="/library/passages"
            icon={<QuoteIcon />}
            label="Passage search"
            tier="shelf"
            active={pathname.startsWith('/library/passages')}
            row={row}
            onNavigate={onNavigate}
          />
          <SidebarLink
            href="/library/notes"
            icon={<BookStackIcon />}
            label="Saved"
            tier="shelf"
            active={pathname.startsWith('/library/notes')}
            row={row}
            onNavigate={onNavigate}
          />
          <SidebarLink
            href="/library/word-study"
            icon={<LanguagesIcon />}
            label="Word study"
            tier="shelf"
            active={pathname.startsWith('/library/word-study')}
            row={row}
            onNavigate={onNavigate}
          />
          {/* MY WORKS WAS UNREACHABLE FROM HERE, which made the whole feature invisible to anyone
              who navigates by the sidebar -- which is everyone. It was linked from the /library
              index page and nowhere else, so it existed, worked, and could not be found.
              This is the same failure the comment 30 lines up describes ("orphan a working
              surface"), repeated on the newest shelf. */}
          <SidebarLink
            href="/library/uploads"
            icon={<BookStackIcon />}
            label="My uploads"
            tier="shelf"
            active={pathname.startsWith('/library/uploads')}
            row={row}
            onNavigate={onNavigate}
          />
        </div>
      </nav>

      {/* Bottom: settings. NOT .edge: on the rail's vellum surface the edge hairline is
          vellum-on-vellum (invisible), so internal rail rules use parchment on vellum,
          the way the mockup's vellum commentary aside uses a white/20 rule. */}
      <div className="border-t border-stone-50 px-2 py-2 dark:border-stone-800">
        <SidebarLink
          href="/settings"
          icon={<SettingsIcon />}
          label="Settings"
          active={pathname === '/settings'}
          row={row}
          onNavigate={onNavigate}
        />
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

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
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

  // The pre-launch password gate stands alone — no app chrome around it.
  if (pathname === '/gate') return null;

  if (writing && !railOpen) {
    // A DELIBERATE SUBSET, not a mirror of the full nav: while writing, the rail offers the few
    // places a reader might actually leave for. Adding a destination here is a design decision,
    // not a sync task — do not derive this from the catalog list.
    const railLinks = [
      { href: '/home', label: 'Home', icon: <HomeIcon /> },
      { href: '/read/jhn/1', label: 'Bible', icon: <BookIcon /> },
      { href: '/ask', label: 'Ancient Paths', icon: <AskIcon /> },
      { href: '/plans', label: 'Reading plans', icon: <CalendarIcon /> },
      { href: '/prayers', label: 'My prayers', icon: <PrayerIcon /> },
      { href: '/library', label: 'All items', icon: <BookStackIcon /> },
      { href: '/settings', label: 'Settings', icon: <SettingsIcon /> },
    ];
    return (
      <aside
        aria-label="Navigation"
        onMouseEnter={() => setRailOpen(true)}
        className="hidden w-[58px] flex-col items-center gap-1 border-r edge bg-stone-200 py-4 md:flex dark:bg-stone-900"
      >
        {railLinks.map((l) => {
          const active = l.href === '/home' ? pathname === '/home' : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
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
      </aside>
    );
  }

  if (collapsed) {
    return (
      <aside className="hidden w-12 flex-col items-center border-r edge bg-stone-200 py-3 md:flex dark:bg-stone-900">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1 text-stone-500 transition-colors ease-gentle hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
          aria-label="Expand sidebar"
        >
          <svg aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
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
          aria-label="Collapse sidebar"
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

/** How many studies the rail lists before "All studies" takes over (design §7.1 says
 *  pinned-then-recents, not a count; the cap is the rail's real estate, not a data rule). */
const MY_STUDIES_NAV_CAP = 5;

/**
 * MY STUDIES (design §7.1) — the sidebar's first fetch-backed section. Pinned studies first,
 * then `updated_at` recents (orderStudiesForNav, shared with the save-to-study picker so the
 * two surfaces never disagree about the order), capped, with "All studies" always reachable.
 * Fetches once per mount of the nav content; a 401 mid-session (sign-out raced the fetch) is
 * an empty list, not an error — the prayer-journal lesson about auth state vs. faults.
 */
function MyStudies({
  pathname,
  row,
  onNavigate,
}: {
  pathname: string;
  row: string;
  onNavigate?: () => void;
}) {
  const [studies, setStudies] = useState<StudySummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch('/api/studies');
        if (!live) return;
        if (res.status === 401) { setStudies([]); return; }
        if (!res.ok) { setError(true); setStudies([]); return; }
        const data = (await res.json()) as { studies?: StudySummary[] };
        setStudies(Array.isArray(data.studies) ? data.studies : []);
      } catch {
        if (live) { setError(true); setStudies([]); }
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="mt-4">
      <div className="mb-1 px-4">
        <span className="text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          My studies
        </span>
      </div>
      {studies === null ? (
        <p className="px-4 py-1 text-xs text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <>
          {error && (
            <p className="px-4 py-1 text-xs text-stone-500 dark:text-stone-400">
              Your studies could not be loaded.
            </p>
          )}
          {orderStudiesForNav(studies, MY_STUDIES_NAV_CAP).map((s) => (
            <SidebarLink
              key={s.id}
              href={`/studies/${s.id}`}
              icon={
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: dotColor(s.id) }}
                />
              }
              label={s.title}
              active={pathname === `/studies/${s.id}`}
              row={row}
              onNavigate={onNavigate}
            />
          ))}
          <SidebarLink
            href="/studies"
            icon={<BookStackIcon />}
            label="All studies"
            active={pathname === '/studies'}
            row={row}
            onNavigate={onNavigate}
          />
        </>
      )}
    </div>
  );
}

const RESEARCH_NAV_CAP = 5;

// RESEARCH HISTORY (ASK_HISTORY_DESIGN §4.6). Mirrors MyStudies deliberately: fetch once,
// three honest states (loading / failed / list), never an error line for a signed-out reader
// (the caller already gates on session). Threads link to /ask/{id} — the durable URL that
// makes back-from-the-reader work by construction (§4.3).
function ResearchHistory({
  pathname,
  row,
  onNavigate,
}: {
  pathname: string;
  row: string;
  onNavigate?: () => void;
}) {
  const [threads, setThreads] = useState<{ id: string; title: string }[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`/api/research?limit=${RESEARCH_NAV_CAP}`);
        if (!live) return;
        if (res.status === 401) { setThreads([]); return; }
        if (!res.ok) { setError(true); setThreads([]); return; }
        const data = (await res.json()) as { threads?: { id: string; title: string }[] };
        setThreads(Array.isArray(data.threads) ? data.threads : []);
      } catch {
        if (live) { setError(true); setThreads([]); }
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // No threads yet and no error → render nothing. The section earns its place with content;
  // an empty "Research history" header over zero rows is a shelf with a label and no books.
  if (threads !== null && threads.length === 0 && !error) return null;

  return (
    <div className="mt-4">
      <div className="mb-1 px-4">
        <span className="text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Research history
        </span>
      </div>
      {threads === null ? (
        <p className="px-4 py-1 text-xs text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <>
          {error && (
            <p className="px-4 py-1 text-xs text-stone-500 dark:text-stone-400">
              Your research could not be loaded.
            </p>
          )}
          {threads.slice(0, RESEARCH_NAV_CAP).map((t) => (
            <SidebarLink
              key={t.id}
              href={`/ask/${t.id}`}
              icon={
                <span className="inline-block h-2 w-2 rounded-full bg-accent-600 dark:bg-accent-400" />
              }
              label={t.title}
              active={pathname === `/ask/${t.id}`}
              row={row}
              onNavigate={onNavigate}
            />
          ))}
        </>
      )}
    </div>
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
        const href = '/prayers';
        return (
          <SidebarLink
            key={item.id}
            href={href}
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

function SidebarButton({
  icon,
  label,
  row = 'py-1.5',
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  row?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
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
