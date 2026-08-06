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

export default function MyWorksPage() {
  return <MyWorksClient />;
}
