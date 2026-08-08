'use client';

// The prayer journal — block `PR1a`.
//
// ── NO AI HERE, AND THAT IS THE FEATURE ─────────────────────────────────────────────────────────
// No suggestions, no completions, no summaries, no "insights". A product whose position is that AI
// is not the Holy Spirit cannot put a model in the prayer closet. `prayers-c9.test.ts` asserts the
// prayer module's whole transitive import graph is free of the AI client, so this stays true when
// nobody is looking.
//
// ── NO STREAKS, NO COUNTS, NO GAMIFICATION ──────────────────────────────────────────────────────
// The block forbids them and the reason is worth keeping: prayer is not a habit metric. There is
// deliberately no "you have prayed N days running" anywhere in this file, and adding one later
// would change what the feature is.
//
// ── READ-FIRST ──────────────────────────────────────────────────────────────────────────────────
// Opening a prayer shows it as written, not as an edit field. Returning to something you prayed is
// the common act; changing it is the rare one, and a cursor blinking in your own words invites
// editing rather than reading.

import { useEffect, useState } from 'react';
// `Link`, not `<a>`: an anchor here forces a full document reload on the way to sign-in and was a
// lint ERROR (@next/next/no-html-link-for-pages), introduced with the signed-out state in PR1a.
import Link from 'next/link';
import { formatVerseId } from '@bible/verse-id';
import { verseHref } from '@/lib/verse-link';
import { DISPLAY_LOCALE } from '@/lib/locale';
import { authClient } from '@/lib/auth/client';
import { runCarryForward } from '@/lib/prayer-carry-forward';

interface Prayer {
  id: string;
  body: string;
  verse_id: number | null;
  created_at: string;
  updated_at: string;
}

const PROMPT = 'Read it again slowly. What is the text saying to you?';

export function PrayerJournal({ initialVerseId = null }: { initialVerseId?: number | null }) {
  const [prayers, setPrayers] = useState<Prayer[] | null>(null);
  const [open, setOpen] = useState<Prayer | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(initialVerseId !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [carried, setCarried] = useState(0);
  const [signedOut, setSignedOut] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { data: session } = authClient.useSession();

  const load = async () => {
    try {
      const res = await fetch('/api/prayers');
      // 401 is not a failure, it is a SIGNED-OUT READER, and the two must not look alike. The
      // first browser pass showed a signed-out visitor a red "could not be loaded" alarm — the
      // app reporting its own auth state as a fault, on the one page where alarming someone is
      // most out of keeping with what the page is for.
      if (res.status === 401) { setSignedOut(true); setPrayers([]); setError(null); return; }
      if (!res.ok) { setError('Your prayers could not be loaded. Please try again.'); setPrayers([]); return; }
      setPrayers((await res.json()).prayers);
      setError(null);
    } catch {
      // `setPrayers([])` matters as much as the message: without it the list stays null, so the
      // "Loading…" branch renders BESIDE the error and the page says both at once, forever.
      setError('Your prayers could not be loaded. Please try again.');
      setPrayers([]);
    }
  };
  useEffect(() => { void load(); }, []);

  // FIRST-LAUNCH CARRY-FORWARD (N4's ruling, absorbed into PR1a).
  //
  // The sidebar's study objects live only in this browser's localStorage, so this is the only
  // place the migration CAN happen. Runs once per reader, best-effort, and does NOT delete its
  // source this release — the three constraints are enforced in `prayer-carry-forward.ts` and
  // red-proofed in `prayer-carry-forward.test.ts`, not here.
  //
  // Keyed on the SIGNED-IN id only. The sidebar also writes a `guest` key when signed out, and
  // carrying that forward would move one person's list into whichever account signs in next on a
  // shared browser. A missed carry is recoverable — the source is still on disk — and that leak is
  // not. Recorded as a known gap in the block rather than decided silently.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    void (async () => {
      const created = await runCarryForward(
        userId,
        async (body) => {
          const res = await fetch('/api/prayers', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind: 'create', body, verseId: null }),
          });
          if (!res.ok) throw new Error('carry-forward post failed');
        },
        window.localStorage,
      );
      if (created > 0) { setCarried(created); void load(); }
    })();
  }, [userId]);

  // Every write reports its own failure rather than assuming success and re-reading — the shape
  // that made `Mark as read` look like it worked while the row never changed (INSTR, 2026-08-07).
  const write = async (payload: Record<string, unknown>, onOk: () => void) => {
    setBusy(true);
    try {
      const res = await fetch('/api/prayers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { setError('That change could not be saved. Please try again.'); return; }
      setError(null);
      onOk();
      await load();
    } catch {
      setError('That change could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const when = (iso: string) => new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

  // ── the prayer space ──────────────────────────────────────────────────────────────────────────
  if (composing || (open && editing)) {
    const isNew = composing;
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        {initialVerseId !== null && isNew && (
          <p className="mb-4 font-scripture text-sm text-stone-500 dark:text-stone-400">
            {formatVerseId(initialVerseId)}
          </p>
        )}
        {/* At most one prompt line, lectio-style. Not a form, not a template, not a prompt library —
            all three are explicitly out of v1. */}
        <p className="mb-5 font-serif text-base italic leading-relaxed text-stone-500 dark:text-stone-400">{PROMPT}</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={14}
          autoFocus
          aria-label="Your prayer"
          /* Its own typography, decoupled from S2 item 9 by owner ruling — wider measure, warmer
             surface, larger than the note field. The space must not feel like a book report. */
          className="focus-quiet w-full resize-none rounded-2xl bg-paper px-6 py-5 font-serif text-lg leading-loose text-stone-800 shadow-paper outline-none placeholder:text-stone-400 dark:bg-stone-900/70 dark:text-stone-100 dark:shadow-none"
          placeholder="…"
        />
        {error && <p role="alert" className="mt-3 text-sm text-red-800 dark:text-red-200">{error}</p>}
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() =>
              void write(
                isNew ? { kind: 'create', body: draft, verseId: initialVerseId }
                      : { kind: 'update', id: open!.id, body: draft },
                () => { setComposing(false); setEditing(false); setOpen(null); setDraft(''); },
              )
            }
            className="inline-flex min-h-[44px] items-center rounded-lg bg-accent-700 px-5 text-sm font-medium text-stone-50 transition-colors ease-gentle hover:bg-accent-800 disabled:opacity-40 dark:bg-accent-500 dark:hover:bg-accent-400"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => { setComposing(false); setEditing(false); setDraft(''); }}
            className="inline-flex min-h-[44px] items-center text-sm text-stone-500 hover:text-stone-800 dark:text-stone-400"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── one prayer, read-first ────────────────────────────────────────────────────────────────────
  if (open) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        <button onClick={() => setOpen(null)} className="mb-5 inline-flex min-h-[44px] items-center text-sm text-accent-700 hover:text-accent-800 dark:text-accent-300">
          ← All prayers
        </button>
        {open.verse_id !== null && (
          <a href={verseHref(open.verse_id)} className="mb-3 block font-scripture text-sm text-stone-500 hover:text-accent-700 dark:text-stone-400">
            {formatVerseId(open.verse_id)}
          </a>
        )}
        <p className="whitespace-pre-wrap font-serif text-lg leading-loose text-stone-800 dark:text-stone-100">{open.body}</p>
        <p className="mt-6 text-xs text-stone-400 dark:text-stone-500">{when(open.created_at)}</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-800 dark:text-red-200">{error}</p>}
        <div className="mt-5 flex items-center gap-4">
          {/* PR1c item 2. This was `window.confirm`, which froze the renderer for 60+ seconds
              during verification and is impassable to automation and to assistive tech — a modal
              that blocks the main thread is an outage with a button on it.
              The confirmation is REPLACED, not removed: deleting someone's prayer on one
              unguarded click would be worse than the dialog was. Two steps, in-page, focusable,
              and cancellable — and the destructive step is the one that has to be sought out. */}
          <button onClick={() => { setDraft(open.body); setEditing(true); }} className="inline-flex min-h-[44px] items-center text-sm text-stone-600 hover:text-accent-700 dark:text-stone-300">Edit</button>
          {confirmingDelete ? (
            <span className="flex items-center gap-3" role="group" aria-label="Confirm delete">
              <span className="font-serif text-sm text-stone-600 dark:text-stone-300">Delete this prayer?</span>
              <button
                autoFocus
                onClick={() => setConfirmingDelete(false)}
                className="inline-flex min-h-[44px] items-center text-sm text-stone-600 hover:text-accent-700 dark:text-stone-300"
              >
                Keep
              </button>
              <button
                disabled={busy}
                onClick={() => void write({ kind: 'delete', id: open.id }, () => { setConfirmingDelete(false); setOpen(null); })}
                className="inline-flex min-h-[44px] items-center text-sm font-medium text-red-800 disabled:opacity-40 dark:text-red-300"
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </span>
          ) : (
            <button
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex min-h-[44px] items-center text-sm text-stone-500 hover:text-red-800 disabled:opacity-40 dark:text-stone-400"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── the journal ───────────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="font-display text-2xl text-stone-800 dark:text-stone-100">Prayer journal</h1>
      <p className="mt-2 font-serif text-base leading-relaxed text-stone-600 dark:text-stone-400">
        Your own words, kept for you alone. Nothing here is searched, indexed, or read by anyone else.
      </p>
      {error && <p role="alert" className="mt-4 text-sm text-red-800 dark:text-red-200">{error}</p>}
      {/* The reader must be TOLD their study objects moved, not just find extra entries in a
          journal they thought was empty. Stated once, plainly, and it says the originals are still
          there — because they are: the carry-forward does not delete its source this release. */}
      {carried > 0 && (
        <p role="status" className="mt-4 rounded-lg bg-accent-700/10 px-3 py-2 text-sm text-ink-600 dark:bg-accent-500/15 dark:text-ink-300">
          {carried === 1 ? 'One item from your study list has' : `${carried} items from your study list have`} been
          brought into your prayer journal. Your study list is unchanged.
        </p>
      )}
      {/* Signed out: an invitation, not an alarm and not a button that would fail on POST. */}
      {signedOut ? (
        <Link
          href="/auth/sign-in"
          className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-accent-700 px-5 text-sm font-medium text-stone-50 transition-colors ease-gentle hover:bg-accent-800 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          Sign in to keep a prayer journal
        </Link>
      ) : (
        <button
          onClick={() => { setDraft(''); setComposing(true); }}
          className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-accent-700 px-5 text-sm font-medium text-stone-50 transition-colors ease-gentle hover:bg-accent-800 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          Write a prayer
        </button>
      )}

      {prayers === null ? (
        <p className="mt-8 text-sm text-stone-500 dark:text-stone-400">Loading…</p>
      ) : signedOut ? (
        <p className="mt-8 rounded-xl bg-paper px-4 py-3 font-serif text-sm text-stone-600 shadow-paper dark:bg-stone-900/70 dark:text-stone-300">
          Your prayers are kept to your account, so they stay yours alone.
        </p>
      ) : prayers.length === 0 ? (
        <p className="mt-8 rounded-xl bg-paper px-4 py-3 font-serif text-sm text-stone-600 shadow-paper dark:bg-stone-900/70 dark:text-stone-300">
          Nothing here yet. A prayer can begin from any verse, or from this page.
        </p>
      ) : (
        <ol className="mt-8 space-y-2">
          {prayers.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => { setOpen(p); setEditing(false); setConfirmingDelete(false); }}
                className="block w-full rounded-xl bg-paper px-4 py-3 text-left shadow-paper transition-colors ease-gentle hover:bg-stone-100/70 dark:bg-stone-900/70 dark:hover:bg-stone-800"
              >
                {p.verse_id !== null && (
                  <span className="mb-1 block font-scripture text-xs text-stone-500 dark:text-stone-400">{formatVerseId(p.verse_id)}</span>
                )}
                <span className="line-clamp-2 font-serif text-base text-stone-800 dark:text-stone-100">{p.body}</span>
                <span className="mt-1 block text-xs text-stone-400 dark:text-stone-500">{when(p.created_at)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
