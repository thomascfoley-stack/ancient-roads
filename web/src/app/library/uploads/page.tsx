import { MyWorksClient } from '@/components/my-works';
import { currentUser } from '@/lib/session';
import { uploadDenial } from '@/lib/user-corpus/access';

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

// Reads the session cookie, so it cannot be prerendered.
export const dynamic = 'force-dynamic';

/**
 * The state is resolved HERE, on the server, rather than by the client's first fetch.
 *
 * It used to be a one-line client wrapper, and `MyWorksClient` opened on `state: 'loading'` —
 * which renders "Loading…" and NOTHING else: no heading, no dropzone, no search box. So every
 * visit showed a blank-ish page, then the whole surface appeared at once and shifted the layout
 * under the pointer. Anything typed or clicked in that window went nowhere. That was hit three
 * times while driving this feature in a browser and each time it read as the app ignoring input.
 *
 * The two facts the client was waiting on — is there a session, and may this account upload —
 * are both known to the server before it renders a byte, and they are the SAME two functions the
 * API route's guard calls, so the page and the endpoint cannot disagree about who is allowed.
 * The client still calls the API for the document list, and still honours a 401/403 from it: this
 * removes a wait, not a check.
 */
export default async function MyWorksPage() {
  const user = await currentUser();
  const initialState = !user ? 'signedout' : uploadDenial(user.id) ? 'unavailable' : 'ready';
  return <MyWorksClient initialState={initialState} />;
}
