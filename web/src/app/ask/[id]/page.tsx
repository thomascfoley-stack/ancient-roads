import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { getThread, servedOf, type StoredAnswer } from '@/lib/research';
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
// §4.4 corpus drift, per ROW: servedOf() checks each cited (register, sourceId) against the
// live embeddings.served predicate — the same rows the ask surface serves from. FAILS CLOSED:
// a null resolution tombstones every citation rather than rendering text the check could not
// vouch for. (Live-battery P1: the first version reused the studies clipping resolver, whose
// key universe never matched ask sourceIds — every reopened thread tombstoned wholesale.)
export default async function ThreadPage(props: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/auth/sign-in');

  const { id } = await props.params;
  const thread = await getThread(user.id, id);
  if (!thread) notFound();

  // Every cited chunk with the register it was surfaced under — retrieval is the composed
  // commentary surface; the four lanes carry their own registers.
  const chunksOf = (answer: StoredAnswer | null): { register: string; sourceId: string }[] => {
    const r = answer?.result;
    if (!r || r.kind === 'empty') return [];
    const out: { register: string; sourceId: string }[] = [];
    for (const c of r.retrieval) out.push({ register: 'commentary', sourceId: c.sourceId });
    const lanes = [
      ['sermon', r.sermons],
      ['theology', r.theology],
      ['song_verse', r.song_verse],
      ['historian', r.historians],
    ] as const;
    for (const [register, cs] of lanes) for (const c of cs ?? []) out.push({ register, sourceId: c.sourceId });
    return out;
  };

  const all: { register: string; sourceId: string }[] = [];
  const seen = new Set<string>();
  for (const t of thread.turns) {
    for (const c of chunksOf(t.answer)) {
      const k = `${c.register}:${c.sourceId}`;
      if (!seen.has(k)) { seen.add(k); all.push(c); }
    }
  }
  const servable = await servedOf(all); // null = resolution failed → tombstone everything

  const initialThread: InitialThread = {
    id: thread.id,
    turns: thread.turns.map((t) => {
      const ids = [...new Set(chunksOf(t.answer).map((c) => c.sourceId))];
      const withdrawnIds = servable === null ? ids : ids.filter((sid) => !servable.has(sid));
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
