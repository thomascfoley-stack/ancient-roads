import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { getStudyWithBlocks, BLOCKS_PAGE_LIMIT } from '@/lib/studies';
import { blockRenderState, resolveServability, TOMBSTONE_NOTICE } from '@/lib/servability';
import { StudyEditor, type EditorBlock } from '@/components/study-editor';

// `/studies/[id]` — the study doc page (design §7.4, Flow C). "My Studies" is the surface name
// (E1); the doc itself is titled by the user.
//
// THE LICENSING RE-CHECK RUNS HERE, SERVER-SIDE, ON THE FIRST BLOCKS PAGE. A stored clipping
// quote bypasses every live licensing predicate when read back, so the page re-checks
// servability (resolveServability — the fail-closed two-leg belt of design §2.4/Flow D) and
// decides each block's render state with the ONE shared rule (blockRenderState, S-10). The
// editor receives the DECISION, never the means to re-derive it; later pages get the same
// treatment from the sibling feed route. Either Flow D leg alone suffices; both run.
//
// `force-dynamic`: per-reader, per-document, and the servability re-check must be live — a
// cached doc page is a licensing bug, not a performance win.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My Studies' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudyDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  // Enforced in the page server component, not middleware — the account page's "Fix A" pattern.
  const user = await currentUser();
  if (!user) redirect('/auth/sign-in');

  // The doc-page read: study + first blocks page, one transaction (lib/studies.ts). A miss is
  // 404 — the study does not exist or is not yours, indistinguishable on purpose (the routes'
  // rule, applied here).
  const found = await getStudyWithBlocks(user.id, id);
  if (!found) notFound();

  const resolution = await resolveServability(found.blocks);
  const blocks: EditorBlock[] = found.blocks.map((b) => ({
    id: b.id,
    position: b.position,
    kind: b.kind,
    body: b.body,
    work_slug: b.work_slug,
    ordinal: b.ordinal,
    quote: b.quote,
    attribution: b.attribution,
    trim_start: b.trim_start,
    trim_end: b.trim_end,
    renderState: blockRenderState(b, resolution),
  }));
  const nextAfterPosition =
    found.blocks.length >= BLOCKS_PAGE_LIMIT ? found.blocks[found.blocks.length - 1]!.position : null;

  return (
    <div className="px-0 py-12 md:py-16">
      {/* v2: the editor owns a wide two-pane canvas (doc + library); the back link shares its
          gutter instead of the old centered 80ch column. */}
      <div className="mx-auto max-w-[1360px] px-6">
        <Link
          href="/studies"
          className="mb-6 inline-flex min-h-[44px] items-center font-sans text-sm text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
        >
          ← All studies
        </Link>
      </div>
      <StudyEditor
        study={{ id: found.study.id, title: found.study.title, pinned: found.study.pinned_at !== null }}
        initialBlocks={blocks}
        initialNextAfterPosition={nextAfterPosition}
        tombstoneNotice={TOMBSTONE_NOTICE}
      />
    </div>
  );
}
