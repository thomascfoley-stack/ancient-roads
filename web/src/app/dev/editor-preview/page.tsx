import { notFound } from 'next/navigation';
import { TOMBSTONE_NOTICE } from '@/lib/servability';
import { StudyEditor, type EditorBlock } from '@/components/study-editor';

// DEV-ONLY editor preview harness. Exists because the BROWSER half of the UI Definition of Done
// (CLAUDE.md: loaded at 390px AND desktop, real interaction, no console errors) has now been
// blocked three times on this machine by the same wall: Neon Auth's env lives only in Vercel,
// so no local session can reach /studies/[id]. This page renders the REAL StudyEditor with
// fixture blocks — no auth, no DB — so layout and interactions can be walked in a real browser.
// Writes from here hit the real API signed-out and FAIL — deliberately: that walk shows the
// S-13 failure states, which the jsdom suite can only assert about. Success paths are jsdom-
// covered; the visual pass this enables is what jsdom cannot do.
//
// PRODUCTION SERVES 404 (the guard below runs server-side on every request; `next build` keeps
// the page but the guard fires before any render). Nothing links here.

export const dynamic = 'force-dynamic';

const FIXTURE_BLOCKS: EditorBlock[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    position: 'V',
    kind: 'text',
    body: 'Jesus began his public ministry around thirty — the age the law set for priestly service. That number is doing more work than it first appears: it places him inside an institution his hearers already trusted.',
    work_slug: null,
    ordinal: null,
    quote: null,
    attribution: null,
    trim_start: null,
    trim_end: null,
    renderState: 'text',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    position: 'W',
    kind: 'clipping',
    body: null,
    work_slug: 'john-gill',
    ordinal: 42,
    quote:
      'And Jesus himself began to be about thirty\nyears of age… an age at which the priests,\nunder the law, who were typical of Christ,\nentered on their work, Num 4:23.\n\nThe word, "began", is left out in the\nSyriac and Persic versions.',
    attribution: { author: 'John Gill', work_title: 'Exposition of the Bible', reference: 'Luke 3:23' },
    trim_start: null,
    trim_end: null,
    renderState: 'clipping',
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    position: 'X',
    kind: 'text',
    body: 'Which is exactly where the priests entered their work — and Luke wants that echo heard.',
    work_slug: null,
    ordinal: null,
    quote: null,
    attribution: null,
    trim_start: null,
    trim_end: null,
    renderState: 'text',
  },
  {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    position: 'Xk',
    kind: 'clipping',
    body: null,
    work_slug: 'matthew-henry',
    ordinal: 12,
    quote: 'He was baptized when he was entering upon the thirtieth year of his age, and the Spirit descended.',
    attribution: { author: 'Matthew Henry', work_title: 'Commentary on the Whole Bible', reference: 'Luke 3' },
    trim_start: 0,
    trim_end: 62,
    renderState: 'clipping',
  },
  {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    position: 'Y',
    kind: 'clipping',
    body: null,
    work_slug: 'chrysostom-homilies',
    ordinal: 7,
    quote: null,
    attribution: { author: 'John Chrysostom', work_title: 'Homilies on Matthew', reference: 'Homily 10' },
    trim_start: null,
    trim_end: null,
    renderState: 'tombstone',
  },
];

export default function EditorPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <div className="px-0 py-12">
      <StudyEditor
        study={{ id: '99999999-9999-4999-8999-999999999999', title: 'How old was Jesus', pinned: false }}
        initialBlocks={FIXTURE_BLOCKS}
        initialNextAfterPosition={null}
        tombstoneNotice={TOMBSTONE_NOTICE}
      />
    </div>
  );
}
