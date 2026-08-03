// The retry policy behind every annotation write (highlight/note/bookmark POST/DELETE) — see
// src/lib/persist-write.ts. This used to be `fetch(...).catch(() => {})`: a dropped request on a
// phone's flaky connection (this app's core use context — CLAUDE.md) silently vanished, the
// optimistic UI never rolled back, and nobody was told. `persistWrite` is the fix's retry half;
// use-annotation-writes.test.ts covers the rollback + visible-error half that sits on top of it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistWrite } from '@/lib/persist-write';

function ok(): Response {
  return { ok: true, status: 200 } as Response;
}
function fail(status: number): Response {
  return { ok: false, status } as Response;
}

describe('persistWrite', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('succeeds immediately on a 2xx response — no retry, no delay', async () => {
    // SEED: make persistWrite always sleep before its first attempt -> this hangs / times out.
    const request = vi.fn().mockResolvedValue(ok());
    await expect(persistWrite(request)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('retries a 500 and succeeds once the server recovers', async () => {
    const request = vi.fn().mockResolvedValueOnce(fail(500)).mockResolvedValueOnce(ok());
    const result = persistWrite(request);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('retries a 429 the same as a 5xx', async () => {
    const request = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok());
    const result = persistWrite(request);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe(true);
  });

  it('retries a thrown network error (offline / DNS / reset) exactly like a 5xx', async () => {
    // SEED: catch the throw inside persistWrite and treat it as a hard failure with no retry ->
    // this fails, because a mobile connection blip is a THROW, not a well-formed error response.
    const request = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok());
    const result = persistWrite(request);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries and reports failure, not a throw', async () => {
    // SEED: remove the attempt cap -> this either hangs or the assertion on call count fails.
    const request = vi.fn().mockResolvedValue(fail(503));
    const result = persistWrite(request);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does NOT retry a 400 — the request itself is invalid, retrying just delays the truth', async () => {
    // SEED: retry on every non-ok status -> this fails on call count (would be 3, not 1) and the
    // caller's rollback/error banner would appear 1.6s late for no benefit.
    const request = vi.fn().mockResolvedValue(fail(400));
    await expect(persistWrite(request)).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a 401 (session expired / unauthenticated) either', async () => {
    const request = vi.fn().mockResolvedValue(fail(401));
    await expect(persistWrite(request)).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
