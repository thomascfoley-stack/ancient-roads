import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { getThread, type StoredAnswer } from '@/lib/research';
import { resolveServability } from '@/lib/servability';
import { AskClient, type InitialThread } from '@/components/ask-client';

export const metadata = {
  title: 'Research thread',
  description: 'A saved research thread — every turn dated, every source attributed.',
};

// /ask/[id] — a research thread, re-read from the database (ASK_HISTORY_DESIGN §4.3: back
// works because this is a real URL, not because client state survived). The page renders the
// stored transcript and mounts the SAME AskClient the live /ask uses, so a follow-up appends
// through the identical streaming path — one renderer, no drift.
//
// §4.4 corpus drift, fixed per inspector findings I1-H1/H2/M6: servability is re-checked
// PER ROW against embeddings.served via the SHARED resolveServability module (the studies
// clippings path — same rule, one implementation), not per work against sources.status. A
// row unserved for licensing while its work stays published (the wesley/calvin pattern)
// tombstones correctly. resolveServability fails CLOSED: on any resolution error it returns
// an empty servable set with failedClosed=true, and every cited row renders as a tombstone
// rather than as possibly-withdrawn text.
export default async function ThreadPage(props: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/auth/sign-in');

  const { id } = await props.params;
  const thread = await getThread(user.id, id);
  if (!thread) notFound();

  // Collect every cited sourceId across the thread — retrieval chunks and all four lanes.
  const allIds = new Set<string>();
  const idsOf = (answer: StoredAnswer | null): string[] => {
    const r = answer?.result;
    if (!r || r.kind === 'empty') return [];
    const ids: string[] = [];
    for (const c of r.retrieval) ids.push(c.sourceId);
    for (const lane of [r.sermons, r.theology, r.song_verse, r.historians]) {
      for (const c of lane ?? []) ids.push(c.sourceId);
    }
    return ids;
  };
  for (const t of thread.turns) for (const sid of idsOf(t.answer)) allIds.add(sid);

  const servability = await resolveServability(
    [...allIds].map((sid) => ({ kind: 'quote', section_id: null, source_id: sid, quote: '', attribution: null })),
  );
  const servable = servability.servableSourceIds;

  const initialThread: InitialThread = {
    id: thread.id,
    turns: thread.turns.map((t) => {
      const ids = idsOf(t.answer);
      // withdrawnIds: rows no longer servable (or unresolvable — failedClosed treats ALL as
      // withdrawn). Voice blocks carry no sourceId; they tombstone via withdrawnIds matched
      // against the retrieval rows they were composed from (the client resolves per voice).
      const withdrawnIds = ids.filter((sid) => !servable.has(sid));
      return {
        question: t.question,
        askedAt: t.askedAt,
        result: (t.answer?.result ?? null) as InitialThread['turns'][number]['result'],
        withdrawnIds,
      };
    }),
  };

  return <AskClient initialThread={initialThread} />;
}
