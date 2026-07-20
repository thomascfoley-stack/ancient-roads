'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth/client';

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

const SEED_SECTIONS: StudySection[] = [
  { id: 'channels', kind: 'channels', name: 'Channels', items: [] },
  { id: 'partners', kind: 'group', name: 'Study Partners', items: [] },
];

const DOT_COLORS = ['#8a4436', '#5c6b46', '#8a6a33', '#4e5d6b', '#7d5a4f'];

function dotColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DOT_COLORS[h % DOT_COLORS.length];
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function storageKey(userId: string | undefined): string {
  return `study-sections:v1:${userId ?? 'guest'}`;
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
  const [sections, setSections] = useState<StudySection[] | null>(null);
  const [addingSection, setAddingSection] = useState(false);

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

  return (
    <>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {/* Quick links */}
        <div className="mb-1 px-2">
          <SidebarLink
            href="/home"
            icon={<HomeIcon />}
            label="Home"
            active={pathname === '/'}
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
          {session?.user ? (
            <SidebarButton
              icon={<LogOutIcon />}
              label="Sign out"
              row={row}
              onClick={async () => {
                await fetch('/api/auth/sign-out', { method: 'POST' });
                window.location.href = '/';
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
            onAddItem={(name) =>
              save(
                sections.map((s) =>
                  s.id === section.id
                    ? { ...s, items: [...s.items, { id: newId(), name }] }
                    : s,
                ),
              )
            }
          />
        ))}

        {/* New section */}
        {sections && (
          <div className="mt-3 px-2">
            {addingSection ? (
              <InlineNameForm
                placeholder="section name"
                onSubmit={(name) => {
                  save([...sections, { id: newId(), kind: 'group', name, items: [] }]);
                  setAddingSection(false);
                }}
                onCancel={() => setAddingSection(false)}
              />
            ) : (
              <button
                onClick={() => setAddingSection(true)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 text-sm text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 active:bg-stone-200/70 dark:hover:bg-stone-800 dark:hover:text-stone-300 ${row}`}
              >
                <span className="flex w-4 items-center justify-center"><PlusIcon /></span>
                <span className="flex-1 truncate text-left">New section</span>
              </button>
            )}
          </div>
        )}

        {/* Library */}
        <div className="mt-4">
          <div className="mb-1 px-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
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
            label="The corpus"
            active={pathname === '/library'}
            row={row}
            onNavigate={onNavigate}
          />
          <SidebarLink
            href="/library/commentaries"
            icon={<QuoteIcon />}
            label="Commentaries"
            active={pathname.startsWith('/library/commentaries')}
            row={row}
            onNavigate={onNavigate}
          />
          <SidebarLink
            href="/library/sermons"
            icon={<QuoteIcon />}
            label="Sermons"
            active={pathname.startsWith('/library/sermons')}
            row={row}
            onNavigate={onNavigate}
          />
          <SidebarLink
            href="/library/hymns-poetry"
            icon={<span className="text-stone-400">♪</span>}
            label="Hymns &amp; poetry"
            active={pathname.startsWith('/library/hymns-poetry')}
            row={row}
            onNavigate={onNavigate}
          />
          {/* The passage-by-passage browse/search. Kept linked: moving it off
              /library/commentaries would otherwise orphan a working surface —
              the same failure this block exists to fix. */}
          <SidebarLink
            href="/library/passages"
            icon={<QuoteIcon />}
            label="Passage search"
            active={pathname.startsWith('/library/passages')}
            row={row}
            onNavigate={onNavigate}
          />
          <SidebarLink
            href="/library/notes"
            icon={<BookStackIcon />}
            label="My library"
            active={pathname.startsWith('/library/notes')}
            row={row}
            onNavigate={onNavigate}
          />
          <SidebarLink
            href="/library/word-study"
            icon={<span className="text-stone-400">אα</span>}
            label="Word study"
            active={pathname.startsWith('/library/word-study')}
            row={row}
            onNavigate={onNavigate}
          />
        </div>
      </nav>

      {/* Bottom: settings */}
      <div className="border-t border-stone-200 px-2 py-2 dark:border-stone-800">
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

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // The pre-launch password gate stands alone — no app chrome around it.
  if (pathname === '/gate') return null;

  if (collapsed) {
    return (
      <aside className="hidden w-12 flex-col items-center border-r border-stone-200 bg-stone-100 py-3 md:flex">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-700"
          aria-label="Expand sidebar"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden w-64 flex-col border-r border-stone-200 bg-stone-50 md:flex dark:border-stone-800 dark:bg-stone-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <Link href="/home" className="font-scripture text-base font-medium text-stone-800 dark:text-stone-100">
          Ancient Paths
        </Link>
        <button
          onClick={() => setCollapsed(true)}
          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          aria-label="Collapse sidebar"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  onAddItem,
}: {
  section: StudySection;
  pathname: string;
  row: string;
  onNavigate?: () => void;
  onRename: (name: string) => void;
  onAddItem: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

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
            <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              {section.name}
            </span>
            <span className="flex items-center gap-0.5 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
              <button
                onClick={() => setRenaming(true)}
                className="rounded p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-600 active:bg-stone-200 dark:hover:bg-stone-800"
                aria-label={`Rename ${section.name}`}
              >
                <PencilIcon />
              </button>
              <button
                onClick={() => setAddingItem(true)}
                className="rounded p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-600 active:bg-stone-200 dark:hover:bg-stone-800"
                aria-label={`Add to ${section.name}`}
              >
                <PlusIcon />
              </button>
            </span>
          </>
        )}
      </div>
      {addingItem && (
        <div className="mx-2 mb-1">
          <InlineNameForm
            placeholder="name"
            onSubmit={(name) => {
              onAddItem(name);
              setAddingItem(false);
            }}
            onCancel={() => setAddingItem(false)}
          />
        </div>
      )}
      {section.items.length === 0 && !addingItem && (
        <p className="px-4 py-2 text-xs text-stone-400">Nothing here yet</p>
      )}
      {section.items.map((item) => {
        const href =
          section.kind === 'channels' ? `/channel/${item.id}` : `/study/${item.id}`;
        return (
          <SidebarLink
            key={item.id}
            href={href}
            icon={
              section.kind === 'channels' ? (
                <span className="text-stone-400">#</span>
              ) : (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: dotColor(item.id) }}
                />
              )
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
        className="w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-base text-stone-800 placeholder:text-stone-400 outline-none focus:border-stone-500 sm:py-1 sm:text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
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
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  row?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 rounded-md px-2 text-sm transition-colors ${row} ${
        active
          ? 'bg-stone-200/80 font-medium text-stone-900 dark:bg-stone-700/70 dark:text-stone-100'
          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-800 active:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200'
      }`}
    >
      <span className="flex w-4 items-center justify-center text-sm">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
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
      className={`flex w-full items-center gap-2.5 rounded-md px-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-800 active:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200 ${row}`}
    >
      <span className="flex w-4 items-center justify-center text-sm">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
    </button>
  );
}

function PlusIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function AskIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.13L3 21l1.87-6.4A8 8 0 1121 12z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function BookStackIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function QuoteIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
