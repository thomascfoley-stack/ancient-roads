import { MyWorksClient } from '@/components/my-works';

// NAMING, per the Slice 1 order's "Naming" section and confirmed with the owner: the product
// surface is **My Works**, never "Sermons". `source_type = 'sermon'` is already a first-class
// CORPUS register (SERMON_CORPUS_FILTER serves Spurgeon, Maclaren, Watson, Flavel, Edwards,
// Wesley), so labelling the upload feature "Sermons" would show a user that word in two places
// meaning two different things — the fathers' sermons in the library, and their own uploads.
//
// `doc_type = 'sermon'` stays as an internal chunking value. It is invisible here.
//
// The route stays /library/uploads: it is linked from the sidebar and changing a URL is a
// redirect's worth of work for no user-visible gain. The LABEL is what the order governs.
export const metadata = { title: 'My Works' };

// ── WHY THIS IS SYNCHRONOUS, AND STAYS SYNCHRONOUS ───────────────────────────────────────────────
// It was briefly an async server component that resolved the session and the upload permission
// before rendering, to kill the blank "Loading…" flash. That fix worked and cost more than it
// bought: `app/library/loading.tsx` wraps EVERY /library/* route in a Suspense boundary, and on a
// HARD load of this URL the browser kept showing that parent fallback and never swapped in the
// resolved segment. Measured: still "Loading the library" 43s in, with
// `/api/user-corpus/documents` never called ONCE. A nearer loading.tsx of its own did not help —
// the parent boundary is the one that renders — so the suspension itself had to go.
//
// In-app navigation from the sidebar was fine throughout (~700ms), which is why this only ever
// bit a refresh or a pasted URL, and why the first report of it as "slow hydration" was too broad.
//
// The flash it was introduced to fix is handled where it belongs instead: MyWorksClient's loading
// state now draws this page's own skeleton rather than the bare word "Loading…", so the shell is
// on screen immediately and nothing shifts under the pointer.
export default function MyWorksPage() {
  return <MyWorksClient />;
}
