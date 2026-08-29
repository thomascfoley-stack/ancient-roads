// K1 (revisit log 2026-08-24 §K1) — a regression I introduced with D11.
//
// The D11 heal path routes a re-uploaded document through requeueForRetry, and that statement sets
// `attempts = 0` (documents.ts). MAX_ATTEMPTS = 3 is what normally retires a permanently-failing
// document: claimNext stops claiming at the ceiling and reapExhausted retires it. So the re-upload
// gesture cleared the ceiling EVERY TIME, and a user re-uploading a file that keeps failing during
// embedding paid for a fresh parse and embed on each cycle — bounded only by the upload rate
// limiter, not by MAX_ATTEMPTS. Before D11 that gesture was a silent no-op, which is what the
// finding complained about; fixing it removed the backstop for this path.
//
// The distinction that fixes it without re-breaking D11:
//   * blobUrl NULL — the prior attempts were burned by a condition that is now repaired (the blob
//     put failed, so the drain failed the row for "not stored"). Those attempts bought nothing.
//     Reset is legitimate: this is the first REAL attempt.
//   * status 'failed' WITH a blob — the document genuinely failed processing N times, and
//     re-uploading identical bytes changes nothing about the content. Do NOT reset; spend what is
//     left of the budget.
//   * status 'failed', blob present, budget exhausted — do not requeue at all. Requeueing without
//     a reset would set status 'queued' on a row claimNext will never claim (its predicate is
//     `attempts < MAX_ATTEMPTS`), which is a silent stall — worse than the loop it replaces.
import { describe, expect, it } from 'vitest';
import { healPlan, isHealable } from '@/lib/user-corpus/documents';

const MAX = 3;
const doc = (over: Partial<{ blobUrl: string | null; status: string; attempts: number }>) =>
  ({ blobUrl: 'u/doc.docx', status: 'failed', attempts: 0, ...over });

describe('K1 — re-uploading must not clear the attempt ceiling', () => {
  it('a blob-less row is stored and reset: its prior attempts bought nothing', () => {
    expect(healPlan(doc({ blobUrl: null, status: 'failed', attempts: 3 }), MAX))
      .toEqual({ action: 'store-and-requeue', resetAttempts: true });
  });

  it('a FAILED row with a blob is requeued WITHOUT resetting — the budget is spent, not refilled', () => {
    expect(healPlan(doc({ status: 'failed', attempts: 1 }), MAX))
      .toEqual({ action: 'requeue', resetAttempts: false });
  });

  it('THE REGRESSION: a failed row at the ceiling is NOT requeued at all', () => {
    expect(healPlan(doc({ status: 'failed', attempts: MAX }), MAX)).toEqual({ action: 'exhausted' });
    expect(healPlan(doc({ status: 'failed', attempts: MAX + 5 }), MAX)).toEqual({ action: 'exhausted' });
  });

  it('THE PROPERTY: re-uploading can never raise the remaining budget above what a fresh failure has', () => {
    // Walk a document through repeated re-uploads. Without the fix this loops forever.
    let attempts = 0;
    let cycles = 0;
    for (; cycles < 50; cycles++) {
      const plan = healPlan(doc({ status: 'failed', attempts }), MAX);
      if (plan.action === 'exhausted') break;
      if (plan.resetAttempts) attempts = 0;
      attempts += 1; // the drain consumes one attempt per pass
    }
    expect(cycles, 'a permanently-failing file must stop consuming embedding spend').toBeLessThanOrEqual(MAX);
  });

  it('a healthy duplicate is still not healable at all — D11 is not re-broken', () => {
    expect(isHealable({ blobUrl: 'u/doc.docx', status: 'ready' })).toBe(false);
    expect(isHealable({ blobUrl: null, status: 'queued' })).toBe(true);
    expect(isHealable({ blobUrl: 'u/doc.docx', status: 'failed' })).toBe(true);
  });

  it('the explicit Retry route keeps its reset — this narrows the re-upload path only', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../src/app/api/user-corpus/documents/[id]/route.ts', import.meta.url), 'utf8'));
    expect(src, 'the Retry button is a deliberate user act and still gets a fresh budget')
      .toMatch(/requeueForRetry\(user\.id, id\)/);
  });
});
