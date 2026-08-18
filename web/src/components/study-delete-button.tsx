'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// B028 — the control that calls `DELETE /api/studies/[id]`.
//
// That endpoint has existed since the studies slice shipped and NOTHING called it: the 2026-08-17
// authenticated QA pass reported "No way to delete a Study from the UI at all" and had to clean up
// after itself with a raw API call. Same shape as the research-thread gap and the bookmark gap —
// working plumbing, no button.
//
// TWO STEPS. A study is a durable body of the reader's own writing and this sits on a list row
// beside a link they click constantly. `onBlur` disarms, so an armed row cannot sit waiting to
// catch a later stray click.
//
// `router.refresh()` RATHER THAN OPTIMISTIC REMOVAL, and this deliberately differs from the
// research-history control. `/studies` is a SERVER component, so the row is server-rendered and
// there is no client-side list to splice; faking one would mean keeping a second copy of the list
// in the client purely to hide a row. Refreshing re-fetches the authoritative list, which cannot
// disagree with the server about what still exists. The cost is a beat of latency, which is the
// right trade for a list that must not lie.
export function DeleteStudyButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const remove = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/studies/${id}`, { method: 'DELETE' });
      // A failed delete must NOT refresh: the row would come back unchanged and read as "the
      // button silently did nothing", which is worse than an error.
      if (!res.ok) { setFailed(true); return; }
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };

  if (failed) {
    return (
      <span role="alert" className="font-sans text-xs text-red-700 dark:text-red-400">
        Could not delete.{' '}
        <button
          type="button"
          onClick={() => { setFailed(false); setArmed(true); }}
          className="underline underline-offset-2"
        >
          Try again
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => (armed ? void remove() : setArmed(true))}
      onBlur={() => setArmed(false)}
      aria-label={armed ? `Confirm delete: ${title}` : `Delete study: ${title}`}
      className={`shrink-0 rounded px-2 py-1 font-sans text-xs transition-colors ease-gentle disabled:opacity-40 ${
        armed
          ? 'font-semibold text-red-700 dark:text-red-400'
          : 'text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200'
      }`}
    >
      {busy ? 'Deleting…' : armed ? 'Delete?' : '×'}
    </button>
  );
}
