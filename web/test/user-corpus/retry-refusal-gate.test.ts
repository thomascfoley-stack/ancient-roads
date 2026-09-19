// The "Try again" refusal gate (the §8 retry docstring; W-REFUSALCODE).
//
// The per-document retry route's own docstring says "Refusals are NOT retryable. A scan without
// a text layer and an empty file are verdicts about the file... Offering retry there would be an
// invitation to click forever." Until migration 131 the route could not honour that: the ingest
// worker's catch maps every non-'empty' UploadRefused (needs_ocr / corrupt /
// too_large_decompressed / the UTF-8-decode unsupported_type) to status='failed' — the SAME value
// a transient-exhaustion row lands at — and there was no column to tell them apart. So the route
// 409'd only on status='empty' and a missing blobUrl, re-queued refusals on every click, and
// requeueForRetry's default resetAttempts:true zeroed `attempts` each click, end-running the
// queue's MAX_ATTEMPTS ceiling exactly as the docstring disavows.
//
// The fix stores the RefusalCode on the row at setDocStatus('failed', …) time (migration 131),
// and the route/UI 409/hide "Try again" when it is present. This suite locks the fix in three
// layers:
//   1. BEHAVIOURAL — setDocStatus writes the code (and clears it on every other transition);
//      requeueForRetry clears it (so a re-queued row gets a fresh verdict, not a stale 409).
//   2. SOURCE-GREP WIRING — the queue worker catch passes `e.code` to setDocStatus, the queue's
//      other direct UPDATEs (reapExhausted, D11 race) clear it, the route 409s before
//      requeueForRetry, and the UI hides the button. A revert of any of these goes red without a
//      DB.
//   3. ROUTE behaviour is pinned end-to-end in documents-id-envelope.test.ts (the four refusal
//      codes 409 and never reach requeueForRetry; a transient 'failed' row still retries).

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── runAsUser mock that captures the SQL the data layer emits ──────────────────────────────
// The repo's existing pattern (retry-claim-guard.test.ts) mocks runAsUser to a vi.fn and asserts
// on the statements the callback builds. That suite only counts statements; here we also need to
// read the SQL text and parameters to confirm `refusal_code` is written and cleared, so the sql
// tag captures each tagged template it receives.

const runAsUser = vi.fn();
vi.mock('@/lib/db', () => ({ runAsUser: (...a: unknown[]) => runAsUser(...a) }));

interface Captured {
  text: string;
  values: unknown[];
}
const captured: Captured[] = [];

// The sql tag the data layer receives. Joins template strings with a sentinel so substring
// assertions are unambiguous, and records the interpolated values for value assertions.
function makeSqlTag() {
  return (strings: TemplateStringsArray, ...values: unknown[]): Captured => {
    const text = strings.join('\u0001');
    const entry: Captured = { text, values };
    captured.push(entry);
    return entry;
  };
}

// The value runAsUser "returns" for the next call — so requeueForRetry's `const [rows] = await
// runAsUser(...)` can see a populated or empty RETURNING set without bypassing the capturing
// implementation (mockResolvedValueOnce would skip cb entirely and capture nothing).
let runAsUserReturn: unknown = [[{ id: 'd1' }]];

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  runAsUserReturn = [[{ id: 'd1' }]];
  runAsUser.mockImplementation(async (_userId: unknown, cb: (sql: unknown) => unknown) => {
    // Run the callback to CAPTURE the SQL it builds, then return the configured value so the
    // caller's destructuring (requeueForRetry read RETURNING rows) still works.
    void cb(makeSqlTag());
    return runAsUserReturn;
  });
});

// ── 1. setDocStatus: writes the refusal code, and clears it on every other transition ──────

describe('setDocStatus — the refusal_code is always written, never left to drift', () => {
  it('records the RefusalCode when the worker catch passes one (a refusal verdict)', async () => {
    const { setDocStatus } = await import('@/lib/user-corpus/documents');
    await setDocStatus('u1', 'd1', 'failed', '…needs OCR…', 'needs_ocr');
    expect(captured).toHaveLength(1);
    expect(captured[0]!.text).toMatch(/refusal_code/);
    expect(captured[0]!.values).toContain('needs_ocr');
  });

  it.each(['queued', 'parsing', 'chunking', 'embedding', 'ready', 'failed', 'empty'] as const)(
    'clears refusal_code (NULL) when no code is passed — every non-refusal transition (%s)',
    async (status) => {
      captured.length = 0;
      const { setDocStatus } = await import('@/lib/user-corpus/documents');
      // The transient-exhaustion catch calls setDocStatus('failed', msg) with NO code; the
      // 'empty' refusal does NOT pass a code either (it has its own status). Both must write NULL
      // so a stale code from a prior verdict can never outlive the row's next state.
      await setDocStatus('u1', 'd1', status, null);
      expect(captured).toHaveLength(1);
      expect(captured[0]!.text).toMatch(/refusal_code/);
      // The refusal_code slot is `${refusalCode ?? null}`; undefined → null in that position.
      // Locate it by index: setDocStatus's UPDATE is a fixed-shape SET, so the 3rd value is
      // refusal_code (status, error, refusal_code, userId, id).
      expect(captured[0]!.values[2]).toBeNull();
    },
  );
});

// ── 2. requeueForRetry: clears refusal_code so a re-queued row gets a fresh verdict ─────────

describe('requeueForRetry — clears the refusal_code alongside parse_error', () => {
  it('writes refusal_code = NULL in the same atomic UPDATE that re-queues the row', async () => {
    const { requeueForRetry } = await import('@/lib/user-corpus/documents');
    const ok = await requeueForRetry('u1', 'd1');
    expect(ok).toBe(true);
    expect(captured).toHaveLength(1);
    // NULL is a literal in the template, not a parameter — assert the text carries it.
    expect(captured[0]!.text).toMatch(/refusal_code\s*=\s*NULL/);
    // And the requeue retains its other invariants (the K1 attempts CASE stays in the same UPDATE).
    expect(captured[0]!.text).toMatch(/attempts\s*=\s*CASE/);
    expect(captured[0]!.text).toMatch(/status\s*=\s*'queued'/);
    expect(captured[0]!.text).toMatch(/parse_error\s*=\s*NULL/);
  });

  it('clearing the code is IN the one atomic statement, not a second transaction', async () => {
    const { requeueForRetry } = await import('@/lib/user-corpus/documents');
    await requeueForRetry('u1', 'd1');
    // The D9 CAS contract: requeueForRetry is ONE runAsUser call (one statement, one transaction),
    // so status/attempts/refusal_code cannot drift into separate transactions the way the original
    // setDocStatus + resetAttempts pair did.
    expect(runAsUser).toHaveBeenCalledTimes(1);
  });
});

// ── 3. Source-grep wiring guards — a revert goes red without a DB ──────────────────────────
// These mirror the repo's existing pattern (upload-complete-heal.test.ts's wiring guard,
// queue-blob-null-guard.test.ts's branch slicing). The behavioural layer above proves the data
// side; these pin that the worker, the route, and the UI all call into it.

describe('refusal-gate wiring — present at every layer', () => {
  const readSrc = async (rel: string) =>
    (await import('node:fs')).readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('queue.ts catch passes the RefusalCode to setDocStatus for the four non-empty refusals', async () => {
    const src = await readSrc('../../src/lib/user-corpus/queue.ts');
    const branch = src.split('if (e instanceof UploadRefused)')[1]!.split('if (e instanceof EmbeddingUnavailable')[0]!;
    expect(branch, "the catch computes a per-verdict RefusalCode (null for 'empty')").toMatch(/refusalCode/);
    expect(branch, 'the catch passes that code to setDocStatus').toMatch(/setDocStatus\(userId, row\.id, status, e\.message, refusalCode\)/);
  });

  it('queue.ts reapExhausted and the D11 race clear refusal_code in their direct UPDATEs', async () => {
    const src = await readSrc('../../src/lib/user-corpus/queue.ts');
    expect(src, 'reapExhausted clears the code on retirement').toMatch(/ refusal_code = NULL/);
    // The D11 blob-null branch has TWO direct UPDATEs (fail-fast, then re-queue); both must clear,
    // so count the occurrences in the branch rather than just asserting at least one.
    const d11 = src.split('if (!row.blob_url)')[1]!.split('try {')[0]!;
    const clears = (d11.match(/refusal_code\s*=\s*NULL/g) ?? []).length;
    expect(clears, 'both the D11 fail-fast and the re-queue must clear refusal_code').toBe(2);
  });

  it('the retry route 409s on doc.refusalCode BEFORE requeueForRetry is reached', async () => {
    const src = await readSrc('../../src/app/api/user-corpus/documents/[id]/route.ts');
    expect(src, 'the route reads the discriminator from the fetched document').toMatch(/doc\.refusalCode/);
    expect(src, 'a refusal verdict 409s with a plain-string error').toMatch(/status: 409/);
    // The refusal gate must come BEFORE requeueForRetry, or it never runs for a refused row.
    expect(src.indexOf('doc.refusalCode')).toBeLessThan(src.indexOf('requeueForRetry(user.id, id)'));
  });

  it('the retry route keeps requeueForRetry(user.id, id) — resets are intact for transient rows', async () => {
    // This is the narrow-scope guarantee: the fix adds a refusal GATE, it does NOT change the
    // reset semantics for transient failures (the docstring's "Resetting is the point"). The
    // heal-attempts-ceiling suite pins the same string.
    const src = await readSrc('../../src/app/api/user-corpus/documents/[id]/route.ts');
    expect(src, 'the Retry button keeps its default reset for transient-exhausted rows').toMatch(/requeueForRetry\(user\.id, id\)/);
  });

  it('the My Works UI hides "Try again" when the row carries a refusal code', async () => {
    const src = await readSrc('../../src/components/my-works.tsx');
    expect(src, 'the button gate excludes refused rows').toMatch(/d\.status === 'failed' && !d\.refusalCode/);
  });
});
