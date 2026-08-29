// D11 (DEEP_SWEEP) — a blob-store failure left the user in a loop with no exit.
//
// The row is created BEFORE putUserDocument. If the put (or setBlobPathname) throws, the caller
// gets a 500 — but the row exists and COUNTS AGAINST QUOTA. Every message then sent them in a
// circle: the drain fails such a row with "The uploaded file was not stored… Please upload it
// again"; re-uploading the same bytes hit findByChecksum and returned 200 "You have already
// uploaded this file" with that same broken row; and the retry route 409s because blobUrl is
// null. The only escape was deleting the document, which no message mentions.
//
// Re-uploading the bytes is both the natural gesture and the one the errors prescribe, so it is
// now the repair rather than a no-op.
import { describe, expect, it } from 'vitest';

describe('D11 — re-uploading the bytes repairs a row whose blob was never stored', () => {
  it('a row whose blob was never stored is healable', async () => {
    const { isHealable } = await import('@/lib/user-corpus/documents');
    expect(isHealable({ blobUrl: null, status: 'queued' })).toBe(true);
  });

  it('a FAILED row is healable too — the natural retry gesture must not no-op', async () => {
    const { isHealable } = await import('@/lib/user-corpus/documents');
    expect(isHealable({ blobUrl: 'u/doc-3.docx', status: 'failed' })).toBe(true);
  });

  it('a healthy duplicate is NOT re-uploaded — dedupe still dedupes', async () => {
    const { isHealable } = await import('@/lib/user-corpus/documents');
    expect(isHealable({ blobUrl: 'u/doc-2.docx', status: 'ready' })).toBe(false);
    expect(isHealable({ blobUrl: 'u/doc-2.docx', status: 'parsing' })).toBe(false);
  });

  // The route must actually wire those three calls; assert it rather than trusting it.
  it('the upload route heals rather than returning the broken row unchanged', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../src/app/api/user-corpus/upload/route.ts', import.meta.url), 'utf8'));
    expect(src).toMatch(/const healable = existing && isHealable\(existing\)/);
    // K1: the route must consult the attempt budget, not just healability.
    expect(src, 'the heal must be planned against MAX_ATTEMPTS').toMatch(/healPlan\(existing, MAX_ATTEMPTS\)/);
    expect(src, 'an exhausted document must not be requeued').toMatch(/plan\.action === 'exhausted'/);
    expect(src, 'and the reset must be the plan\u2019s, never unconditional')
      .toMatch(/requeueForRetry\(user\.id, existing\.id, \{ resetAttempts: plan\.resetAttempts \}\)/);
    expect(src, 'the bytes must actually be stored onto the existing row').toMatch(/putUserDocument\(user\.id, existing\.id, bytes\)/);

    expect(src, 'and the drain kicked').toMatch(/kickDrain\(user\.id\)/);
  });
});
