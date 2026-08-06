// One door for every user-corpus route: who is calling, and may they use this feature at all.
//
// Six handlers across four route files repeated the same `requireUser` try/catch and then served
// ANY authenticated caller. That second half is what UPLOADER_DESIGN §4 condition 2 forbids
// before the SEC-1 cutover - "the upload endpoints hard-allowlist the owner's user id, so no
// second account can reach them even if one exists" - and it existed only as prose.
//
// Adding the allowlist check to six handlers by hand is how one of them ends up missing it, so the
// pair lives here and the routes have no way to do one without the other.

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { uploadDenial } from './access';

export interface GuardedUser {
  id: string;
  email: string;
}

type Guarded =
  | { user: GuardedUser; denied?: never }
  | { user?: never; denied: NextResponse };

/**
 * The caller, or the response to return instead of serving them.
 *
 * 401 for no session; 403 when the feature is not open to this account. 403 rather than 404
 * because, unlike an individual document id, the existence of the feature is not a secret - the
 * nav links to it - and a 404 here would send a permitted-but-misconfigured owner hunting for a
 * bug in the route rather than in their env.
 */
export async function guardUser(): Promise<Guarded> {
  let user: GuardedUser;
  try {
    user = await requireUser();
  } catch {
    return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const reason = uploadDenial(user.id);
  if (reason) return { denied: NextResponse.json({ error: reason }, { status: 403 }) };

  return { user };
}
