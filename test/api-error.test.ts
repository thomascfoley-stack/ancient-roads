// Guards the stable API error contract (web/src/lib/api-error.ts, docs/API_ERRORS.md).
// The security-critical property: error responses NEVER leak an internal cause.

import { describe, expect, it } from 'vitest';
import { apiError, type ApiErrorCode } from '../web/src/lib/api-error';

const jsonOf = async (r: Response) => (await r.json()) as { error: { code: string; message: string; retryAfterSec?: number } };

describe('apiError (API error contract)', () => {
  it('RATE_LIMIT_MINUTE → 429 + Retry-After + machine code', async () => {
    const r = apiError('RATE_LIMIT_MINUTE', { retryAfterSec: 60 });
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('60');
    const b = await jsonOf(r);
    expect(b.error.code).toBe('RATE_LIMIT_MINUTE');
    expect(b.error.retryAfterSec).toBe(60);
  });
  it('UNAUTHENTICATED → 401, no Retry-After', async () => {
    const r = apiError('UNAUTHENTICATED');
    expect(r.status).toBe(401);
    expect(r.headers.get('Retry-After')).toBeNull();
    expect((await jsonOf(r)).error.code).toBe('UNAUTHENTICATED');
  });
  it('GATE_LOCKED → 503 with a vague message (cause never revealed)', async () => {
    const b = await jsonOf(apiError('GATE_LOCKED'));
    expect(b.error.message).not.toMatch(/password|SITE_PASSWORD|config|gate/i);
  });
  it('INTERNAL → 500 generic (never surfaces internals)', async () => {
    const r = apiError('INTERNAL');
    expect(r.status).toBe(500);
    expect((await jsonOf(r)).error.message).not.toMatch(/stack|exception|db|undefined|null/i);
  });
  it('a safe message override keeps the code + status', async () => {
    const r = apiError('INVALID_REQUEST', { message: 'A question is required.' });
    expect(r.status).toBe(400);
    const b = await jsonOf(r);
    expect(b.error.code).toBe('INVALID_REQUEST');
    expect(b.error.message).toBe('A question is required.');
  });
  it('every registry code returns its declared status (no ad-hoc shapes)', async () => {
    const expected: Record<ApiErrorCode, number> = {
      RATE_LIMIT_MINUTE: 429, RATE_LIMIT_DAY: 429, UNAUTHENTICATED: 401,
      GATE_LOCKED: 503, UPSTREAM_UNAVAILABLE: 503, INVALID_REQUEST: 400, INTERNAL: 500,
      // 403, and deliberately NOT 401: the caller is authenticated and still refused
      // (ADR-116 ruling 3, the gated-beta teacher gate). This map is `Record<ApiErrorCode, …>`
      // on purpose — adding a code to the union without declaring its status here is a
      // typecheck failure, which is exactly how this line came to exist.
      FORBIDDEN: 403,
    };
    for (const [code, status] of Object.entries(expected)) {
      const r = apiError(code as ApiErrorCode);
      expect(r.status).toBe(status);
      expect((await jsonOf(r)).error.code).toBe(code);
    }
  });
});
