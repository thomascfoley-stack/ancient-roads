// Layer 1 — tenancy invariant: user A cannot read or write user B's data.
// Two-account test, executed against the real DB when APP_DATABASE_URL is set.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createChannel, addMessage, getMessages } from '@/lib/chat';
import { getDb, runAsUser } from '@/lib/db';
import { runtimeDbUrl, requireDbInCi } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const dbUrl = requireDbInCi();
const userA = `qa-tenancy-a-${Date.now()}`;
const userB = `qa-tenancy-b-${Date.now()}`;
let channelId = '';
let created = false;

// A DB-less run must READ as NOT RUN, not as coverage — see helpers/loud-skip.ts.
const SKIP = announceSkip(
  'Layer 1 — tenancy invariant (two-account, executed)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'the two-account tenancy invariant on user data',
);

describe.skipIf(SKIP)('Layer 1 — tenancy invariant (two-account, executed)', () => {
  beforeAll(async () => {
    const ch = await createChannel(userA, 'qa-tenancy-channel');
    channelId = ch.id;
    await addMessage(userA, channelId, null, 'user', 'secret-from-a');
    created = true;
  }, 30_000);

  afterAll(async () => {
    if (!created || !dbUrl) return;
    const sql = getDb();
    await runAsUser(userA, (s) => [
      s`DELETE FROM messages WHERE channel_id = ${channelId}`,
      s`DELETE FROM channels WHERE id = ${channelId}`,
    ]);
  }, 30_000);

  it('user B cannot read user A channel messages (H1 belt + RLS)', async () => {
    const msgs = await getMessages(userB, channelId, null);
    expect(msgs).toEqual([]);
  });

  it('user B cannot write into user A channel (H2 IDOR guard)', async () => {
    await expect(addMessage(userB, channelId, null, 'user', 'cross-tenant')).rejects.toThrow(
      /not found|not owned/i,
    );
  });

  it('user A can still read their own messages', async () => {
    const msgs = await getMessages(userA, channelId, null);
    expect(msgs.some((m) => m.content === 'secret-from-a')).toBe(true);
  });
});
