'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Channel {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
}

interface Chat {
  id: string;
  title: string;
  persona: string;
  icon_color: string;
}

const PERSONA_LABELS: Record<string, string> = {
  general: 'General study',
  reformer: 'Reformer guide',
  puritan: 'Puritan tutor',
  patristic: 'Early church',
  evangelical: 'Evangelical',
};

export function Sidebar() {
  const pathname = usePathname();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);

  useEffect(() => {
    fetch('/api/channels').then(r => r.ok ? r.json() : []).then(setChannels).catch(() => {});
    fetch('/api/chats').then(r => r.ok ? r.json() : []).then(setChats).catch(() => {});
  }, []);

  const handleCreateChannel = useCallback(async () => {
    const name = newChannelName.trim();
    if (!name) return;
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const channel = await res.json();
      setChannels(prev => [...prev, channel]);
      setNewChannelName('');
      setShowNewChannel(false);
    }
  }, [newChannelName]);

  const handleCreateChat = useCallback(async () => {
    const title = newChatTitle.trim();
    if (!title) return;
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const chat = await res.json();
      setChats(prev => [...prev, chat]);
      setNewChatTitle('');
      setShowNewChat(false);
    }
  }, [newChatTitle]);

  if (collapsed) {
    return (
      <aside className="flex w-12 flex-col items-center border-r border-stone-200 bg-stone-100 py-3">
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
    <aside className="flex w-64 flex-col border-r border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <Link href="/" className="font-scripture text-base font-medium text-stone-800 dark:text-stone-100">
          Ancient Roads
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

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {/* Quick links */}
        <div className="mb-1 px-2">
          <SidebarLink
            href="/"
            icon={<HomeIcon />}
            label="Home"
            active={pathname === '/'}
          />
          <SidebarLink
            href="/read/jhn/1"
            icon={<BookIcon />}
            label="Reader"
            active={pathname.startsWith('/read')}
          />
          <SidebarLink
            href="/auth/sign-in"
            icon={<UserIcon />}
            label="Account"
            active={pathname.startsWith('/auth') || pathname.startsWith('/account')}
          />
        </div>

        {/* Channels */}
        <div className="mt-4">
          <SectionHeader
            label="Channels"
            onAdd={() => setShowNewChannel(true)}
          />
          {showNewChannel && (
            <form
              onSubmit={(e) => { e.preventDefault(); handleCreateChannel(); }}
              className="mx-2 mb-1"
            >
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="channel name"
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:border-stone-500"
                autoFocus
                onBlur={() => { if (!newChannelName.trim()) setShowNewChannel(false); }}
              />
            </form>
          )}
          {channels.length === 0 && !showNewChannel && (
            <p className="px-4 py-2 text-xs text-stone-400">No channels yet</p>
          )}
          {channels.map((ch) => (
            <SidebarLink
              key={ch.id}
              href={`/channel/${ch.id}`}
              icon={<span className="text-stone-400">#</span>}
              label={ch.name}
              active={pathname === `/channel/${ch.id}`}
            />
          ))}
        </div>

        {/* Study partners (DM chats) */}
        <div className="mt-4">
          <SectionHeader
            label="Study partners"
            onAdd={() => setShowNewChat(true)}
          />
          {showNewChat && (
            <form
              onSubmit={(e) => { e.preventDefault(); handleCreateChat(); }}
              className="mx-2 mb-1"
            >
              <input
                type="text"
                value={newChatTitle}
                onChange={(e) => setNewChatTitle(e.target.value)}
                placeholder="chat name"
                className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:border-stone-500"
                autoFocus
                onBlur={() => { if (!newChatTitle.trim()) setShowNewChat(false); }}
              />
            </form>
          )}
          {chats.length === 0 && !showNewChat && (
            <p className="px-4 py-2 text-xs text-stone-400">No chats yet</p>
          )}
          {chats.map((chat) => (
            <SidebarLink
              key={chat.id}
              href={`/chat/${chat.id}`}
              icon={
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: chat.icon_color }}
                />
              }
              label={chat.title}
              sublabel={PERSONA_LABELS[chat.persona] ?? chat.persona}
              active={pathname === `/chat/${chat.id}`}
            />
          ))}
        </div>

        {/* Library */}
        <div className="mt-4">
          <SectionHeader label="Library" />
          <SidebarLink
            href="/library/notes"
            icon={<BookStackIcon />}
            label="My library"
            active={pathname.startsWith('/library/notes')}
          />
          <SidebarLink
            href="/library/commentaries"
            icon={<QuoteIcon />}
            label="Commentaries"
            active={pathname.startsWith('/library/commentaries')}
          />
          <SidebarLink
            href="/library/word-study"
            icon={<span className="text-stone-400">אα</span>}
            label="Word study"
            active={pathname.startsWith('/library/word-study')}
          />
          <SidebarLink
            href="/library/uploads"
            icon={<UploadIcon />}
            label="Uploaded files"
            active={pathname.startsWith('/library/uploads')}
          />
        </div>
      </nav>

      {/* Bottom: settings */}
      <div className="border-t border-stone-200 px-2 py-2">
        <SidebarLink
          href="/settings"
          icon={<SettingsIcon />}
          label="Settings"
          active={pathname === '/settings'}
        />
      </div>
    </aside>
  );
}

function SectionHeader({ label, onAdd }: { label: string; onAdd?: () => void }) {
  return (
    <div className="mb-1 flex items-center justify-between px-4">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
        {label}
      </span>
      {onAdd && (
        <button
          onClick={onAdd}
          className="rounded p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-600"
          aria-label={`Add ${label.toLowerCase()}`}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  sublabel,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-stone-200/80 font-medium text-stone-900 dark:bg-stone-700/70 dark:text-stone-100'
          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200'
      }`}
    >
      <span className="flex w-4 items-center justify-center text-sm">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {sublabel && (
        <span className="truncate text-[10px] text-stone-400">{sublabel}</span>
      )}
    </Link>
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

function UploadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
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
