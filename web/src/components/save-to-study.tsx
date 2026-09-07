'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { TextSkeleton } from './skeleton';
import { useDialog } from '@/lib/use-dialog';

// THE ONE CANONICAL SAVE-TO-STUDY VERB (design §7.5, R3; build file P2/W4). Every surfaced
// corpus item on every surface — ask answers today; reader and search surfaces import this
// same component — gets this affordance, and its behaviour is identical everywhere:
//
//   - ONE TAP (E7, ruled 2026-08-12 "always auto-save, never ask"): the default target is the
//     study the user last saved to, kept in localStorage (S-9: client-only, keyed per user,
//     NEVER load-bearing — its absence just means "open the picker"). Tap → POST the clipping
//     → toast "Saved to <title>. Change?" — Change? is the picker's only entry point after a
//     save. With no stored target the first tap opens the picker, because there is no default
//     to save to; that is the picker's only other entry.
//   - THE PICKER IS THE SECOND TAP, ONLY WHEN WANTED (design §7.5, review P-3): pinned
//     studies first, then recents (the §7.1 order, shared with the sidebar via
//     orderStudiesForNav), then "New study", titled from the surface's context.
//   - "Change?" MOVES the just-saved clipping: save to the newly chosen study first, then
//     delete the block from the previous one. That order means a failure leaves a duplicate
//     the user can see and delete, never a silent loss — and no move op exists in P1, so this
//     is the honest composition of the ops that do.
//
// The affordance sends a REFERENCE only (sourceId from the ask surface, sectionId from the
// reader/search surfaces) — never quote text. The server snapshots quote and attribution in
// the same INSERT…SELECT that writes the block (design F3, S-1); there is no code path on
// which client-supplied text reaches the table, and this component is the client half of
// that property. Error states are accurate per the route's codes (the blanket-401 pattern
// is a known defect and is not copied): 401 is a signed-out reader and says so; 404 on the
// stored target means the study is gone — the stale default is cleared and the picker
// opens; 409 NOT_SERVABLE passes the route's own message through.

/** Mirror of STUDY_TITLE_MAX in @/lib/studies.ts — that module is server-only (it imports
 *  the db layer), so the bound is restated here rather than imported into a client bundle. */
const NEW_STUDY_TITLE_MAX = 300;

/** Sidebar/picker list cap — how many studies render before "All studies" takes over. */
const NAV_CAP = 5;

export interface StudySummary {
  id: string;
  title: string;
  pinned_at: string | null;
  updated_at: string;
}

/** The clipping reference a surface hands us — exactly the route's two shapes, never text. */
export type ClipRef =
  // `askOutcomeId` (migration 125): the ask this voice was surfaced by, when the clip comes from
  // the ask surface. Kept-from-an-ask is the only behavioural relevance signal this product
  // records, and the association cannot be reconstructed after the fact — so it travels with the
  // clip or it is lost. Only the ask surface has one; the reader and topic surfaces never do.
  | { sourceId: string; reference?: string; matchHint?: string; askOutcomeId?: string }
  | { sectionId: number; reference?: string; matchHint?: string };

interface LastTarget {
  id: string;
  title: string;
}

/** localStorage key prefix, exported so tests (and only tests) key off the same constant. */
export const LAST_TARGET_KEY_PREFIX = 'save-to-study:last-target:v1';

function targetKey(userId: string | undefined): string {
  return `${LAST_TARGET_KEY_PREFIX}:${userId ?? 'guest'}`;
}

function readLastTarget(userId: string | undefined): LastTarget | null {
  try {
    const raw = localStorage.getItem(targetKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastTarget>;
    return typeof parsed.id === 'string' && typeof parsed.title === 'string'
      ? { id: parsed.id, title: parsed.title }
      : null;
  } catch {
    return null; // storage unavailable (private mode) or a corrupt entry — the picker is the fallback
  }
}

function writeLastTarget(userId: string | undefined, target: LastTarget): void {
  try {
    localStorage.setItem(targetKey(userId), JSON.stringify(target));
  } catch {
    // storage unavailable; the next save simply opens the picker again — never load-bearing (S-9)
  }
}

function clearLastTarget(userId: string | undefined): void {
  try {
    localStorage.removeItem(targetKey(userId));
  } catch {
    // as above
  }
}

/**
 * §7.1's order — pinned studies first, then recents — as a STABLE partition. The API already
 * returns updated_at-desc, so each group keeps that order; re-sorting here would only be a
 * second source of truth. Shared by the sidebar's MY STUDIES section and the picker.
 */
export function orderStudiesForNav<T extends { pinned_at: string | null }>(
  studies: readonly T[],
  cap: number,
): T[] {
  const pinned = studies.filter((s) => s.pinned_at !== null);
  const rest = studies.filter((s) => s.pinned_at === null);
  return [...pinned, ...rest].slice(0, cap);
}

// ── ask-surface voice resolution ────────────────────────────────────────────────────────────
// A voice block's `section_id` is PROMPT-LOCAL (a 1..N index into the composer's re-sorted
// voice subset — web/src/lib/teacher/teach.ts selectVoices), never a corpus key, so it cannot
// be saved from. The only honest route to a saveable key is matching the voice back against
// the turn's retrieval rows, which DO carry `sourceId`. The verifier guarantees the quote is
// verbatim in the cited chunk, so containment is proof; attribution alone decides only when
// it names exactly one row; anything ambiguous resolves to null and the surface renders no
// affordance — a wrong guess would save the wrong passage's bytes into the user's study.

export interface RetrievalLike {
  sourceId: string;
  content: string;
  metadata: { author: string; sourceTitle: string | null };
}

export interface VoiceLike {
  quote: string;
  attribution: { author: string; work: string };
}

const collapseWhitespace = (s: string) => s.replace(/\s+/g, ' ').trim();

// Typographic fold: curly quotes -> straight, en/em dashes -> hyphen, then whitespace-collapse.
// The verifier passes a quote on a NORMALIZED match, so one smart quote of drift between the
// composed voice and the retrieval bytes passed verification and failed resolution here — which
// mattered once resolution failure started failing closed on withdrawn threads (audit #7): every
// avoidable null is a voice that would tombstone unnecessarily.
const typographicFold = (s: string) =>
  collapseWhitespace(s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-'));

export function resolveVoiceSourceId(
  retrieval: readonly RetrievalLike[],
  voice: VoiceLike,
): string | null {
  const exact = retrieval.filter((r) => r.content.includes(voice.quote));
  const collapsed =
    exact.length > 0
      ? exact
      : retrieval.filter((r) =>
          collapseWhitespace(r.content).includes(collapseWhitespace(voice.quote)),
        );
  // Third tier, added with audit #7's fail-closed change: typographic drift only.
  const byQuote =
    collapsed.length > 0
      ? collapsed
      : retrieval.filter((r) => typographicFold(r.content).includes(typographicFold(voice.quote)));
  if (byQuote.length > 0) return byQuote[0]!.sourceId;
  const byAttribution = retrieval.filter(
    (r) => r.metadata.author === voice.attribution.author && r.metadata.sourceTitle === voice.attribution.work,
  );
  return byAttribution.length === 1 ? byAttribution[0]!.sourceId : null;
}

// ── the component ───────────────────────────────────────────────────────────────────────────

type SaveOutcome = { ok: true; blockId: string } | { ok: false; status: number; message: string };

export function SaveToStudy({ clip, contextTitle, className }: { clip: ClipRef; contextTitle?: string; className?: string }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The saved block, while its toast is up — `Change?` moves exactly this block.
  const [saved, setSaved] = useState<{ studyId: string; title: string; blockId: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 6000);
    return () => clearTimeout(t);
  }, [saved]);

  const postClip = useCallback(async (studyId: string): Promise<SaveOutcome> => {
    const body =
      'sourceId' in clip
        ? { kind: 'clipping', sourceId: clip.sourceId, reference: clip.reference, askOutcomeId: clip.askOutcomeId }
        // B030: `matchHint` is a HINT, never text to store — the server locates it in its own
        // snapshot and stores the surrounding paragraph as a trim VIEW. The S-1 rule that no
        // surface may send `quote`/`attribution` is untouched: this field cannot become content.
        : { kind: 'clipping', sectionId: clip.sectionId, reference: clip.reference, matchHint: clip.matchHint };
    const res = await fetch(`/api/studies/${studyId}/blocks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 201) {
      const data = (await res.json()) as { block: { id: string } };
      return { ok: true, blockId: data.block.id };
    }
    let message = 'The save did not complete. Please try again.';
    try {
      const data = (await res.json()) as { error?: { message?: unknown } };
      if (typeof data.error?.message === 'string') message = data.error.message;
    } catch {
      // an unparseable error body keeps the default message — the status is still reported
    }
    return { ok: false, status: res.status, message };
  }, [clip]);

  const saveTo = useCallback(
    async (target: LastTarget, moveFrom?: { studyId: string; blockId: string }) => {
      setBusy(true);
      setNotice(null);
      try {
        const res = await postClip(target.id);
        if (!res.ok) {
          if (res.status === 401) {
            setNotice('Sign in to save to a study.');
            setPickerOpen(false);
            return;
          }
          if (res.status === 404 && !moveFrom) {
            // The stored default target is gone (deleted on another device/tab). A stale
            // default that keeps failing is worse than no default — clear it and pick.
            clearLastTarget(userId);
            setNotice('That study no longer exists. Choose another:');
            setPickerOpen(true);
            return;
          }
          setNotice(res.message);
          return;
        }
        if (moveFrom) {
          // The "Change?" move: the new copy exists before the old one is deleted, so a
          // failure here leaves a visible duplicate, never a silent loss.
          await fetch(`/api/studies/${moveFrom.studyId}/blocks?blockId=${moveFrom.blockId}`, {
            method: 'DELETE',
          }).catch(() => {});
        }
        writeLastTarget(userId, target);
        setPickerOpen(false);
        setSaved({ studyId: target.id, title: target.title, blockId: res.blockId });
      } catch {
        setNotice('Network error. The save did not complete — please try again.');
      } finally {
        setBusy(false);
      }
    },
    [postClip, userId],
  );

  const onTap = () => {
    if (busy) return;
    setSaved(null);
    setNotice(null);
    const target = readLastTarget(userId);
    if (!target) {
      setPickerOpen(true);
      return;
    }
    void saveTo(target);
  };

  const newStudyTitle =
    (contextTitle ?? '').trim().slice(0, NEW_STUDY_TITLE_MAX) || 'Untitled study';
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closePicker = useCallback(() => {
    setPickerOpen(false);
    // Return focus to the trigger so keyboard users do not lose their place.
    triggerRef.current?.focus();
  }, []);

  return (
    <div className={`relative${className ? ` ${className}` : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onTap}
        disabled={busy}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        className="inline-flex min-h-[44px] items-center text-xs font-medium text-stone-500 transition-colors ease-gentle hover:text-stone-900 disabled:opacity-40 dark:text-stone-400 dark:hover:text-stone-200"
      >
        {busy ? 'Saving…' : 'Save to study'}
      </button>

      {pickerOpen && (
        <StudyPicker
          busy={busy}
          newStudyTitle={newStudyTitle}
          onPick={(target) => void saveTo(target, saved ? { studyId: saved.studyId, blockId: saved.blockId } : undefined)}
          onClose={closePicker}
        />
      )}

      {saved && !pickerOpen && (
        <p role="status" className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
          <span className="font-medium text-stone-700 dark:text-stone-300">Saved to {saved.title}.</span>{' '}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="font-medium text-accent-700 underline underline-offset-2 hover:text-accent-800 dark:text-accent-300 dark:hover:text-accent-200"
          >
            Change?
          </button>
        </p>
      )}
      {notice && (
        <p role="alert" className="mt-0.5 text-xs text-red-800 dark:text-red-200">
          {notice}
        </p>
      )}
    </div>
  );
}

function StudyPicker({
  busy,
  newStudyTitle,
  onPick,
  onClose,
}: {
  busy: boolean;
  newStudyTitle: string;
  onPick: (target: LastTarget) => void;
  onClose: () => void;
}) {
  const [studies, setStudies] = useState<StudySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // This picker already had `role="dialog"`, an Escape handler and a focus return; what it did not
  // have was the TRAP, so Tab walked straight out of an open picker into the page beneath while
  // its own click-away scrim still covered the screen. useDialog supplies all four, so the
  // hand-rolled halves come out rather than run twice (its Escape listener is capture-phase and
  // stops propagation, which would have swallowed the onKeyDown one anyway).
  const { ref: dialogRef, dialogProps } = useDialog(onClose, 'Choose a study');

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch('/api/studies');
        if (!live) return;
        if (res.status === 401) {
          setError('Sign in to save to a study.');
          setStudies([]);
          return;
        }
        if (!res.ok) {
          setError('Your studies could not be loaded. Please try again.');
          setStudies([]);
          return;
        }
        setStudies(((await res.json()) as { studies: StudySummary[] }).studies);
      } catch {
        if (live) {
          setError('Your studies could not be loaded. Please try again.');
          setStudies([]);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Move focus into the picker once its contents ARRIVE. useDialog has already put focus inside on
  // open — at that moment the only focusable is "New study", because the list is still loading —
  // and this moves it onto the first study once there is one. `dialogRef` is in the deps because
  // it now comes from a hook rather than a bare useRef, so the linter cannot prove it stable; the
  // ref object never changes identity, so the effect still runs only when `studies` does.
  useEffect(() => {
    if (studies === null) return;
    const first = dialogRef.current?.querySelector('button, a[href]') as HTMLElement | null;
    first?.focus();
  }, [studies, dialogRef]);

  const createAndPick = async () => {
    try {
      const res = await fetch('/api/studies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: newStudyTitle }),
      });
      if (res.status === 401) { setError('Sign in to save to a study.'); return; }
      if (!res.ok) { setError('The new study could not be created. Please try again.'); return; }
      const { study } = (await res.json()) as { study: StudySummary };
      onPick({ id: study.id, title: study.title });
    } catch {
      setError('Network error. The new study could not be created.');
    }
  };

  return (
    <>
      {/* Click-away layer: the picker is the second tap, so it must also be one tap to dismiss. */}
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        {...dialogProps}
        className="edge absolute left-0 z-20 mt-1 w-64 border bg-stone-50 p-2 dark:bg-stone-950"
      >
        {/* A short list in a 64-wide popover: three bars, because the popover is already open at a
            fixed width and the reader is looking straight at it. */}
        {studies === null && <TextSkeleton label="Loading your studies" lines={3} className="px-2 py-1.5" />}
        {error && (
          <p role="alert" className="px-2 py-1.5 text-xs text-red-800 dark:text-red-200">
            {error}
          </p>
        )}
        {studies !== null && !error && studies.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-stone-500 dark:text-stone-400">No studies yet.</p>
        )}
        {orderStudiesForNav(studies ?? [], NAV_CAP).map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => onPick({ id: s.id, title: s.title })}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-stone-700 transition-colors ease-gentle hover:bg-stone-100 disabled:opacity-40 dark:text-stone-300 dark:hover:bg-stone-800/60"
          >
            <span className="flex-1 truncate">{s.title}</span>
            {s.pinned_at !== null && (
              <span className="text-micro uppercase tracking-wider text-stone-400 dark:text-stone-500">pinned</span>
            )}
          </button>
        ))}
        {studies !== null && studies.length > NAV_CAP && (
          <Link
            href="/studies"
            onClick={onClose}
            className="edge flex w-full items-center border-t px-2 py-1.5 text-left text-sm font-medium text-stone-700 transition-colors ease-gentle hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800/60"
          >
            <span className="truncate">All studies</span>
          </Link>
        )}
        {/* "New study", titled from the surface's context (design §7.5) — the question on the
            ask surface, so the study names itself after what was being asked about. */}
        <button
          type="button"
          disabled={busy}
          onClick={() => void createAndPick()}
          className="edge mt-1 flex w-full items-center border-t px-2 py-1.5 text-left text-sm font-medium text-accent-700 transition-colors ease-gentle hover:bg-stone-100 disabled:opacity-40 dark:text-accent-300 dark:hover:bg-stone-800/60"
        >
          <span className="truncate">New study: “{newStudyTitle}”</span>
        </button>
      </div>
    </>
  );
}
