// Regression — B3 (#119): /api/eval/bait called `await teach(question)` with NO try/catch,
// so a teach() throw (notably embedQuery()) escaped into Next's raw 500 — not the
// { error: { code, message } } envelope every /api/* route promises (lib/api-error.ts
// header, docs/API_ERRORS.md) — and it never reached logEvent('error', ...). /api/ask
// wraps the same call correctly. SEED: unwrap the teach() call → this goes RED.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/teacher/teach', () => ({
  teach: vi.fn(async () => {
    throw new Error('embedQuery exploded');
  }),
}));

describe('bait-route-teach-error-envelope (B3, #119)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('a teach() throw returns the 500 INTERNAL envelope, and logs the error', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EVAL_HARNESS_SECRET', 'test-secret');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { POST } = await import('@/app/api/eval/bait/route');
    const req = new NextRequest('http://localhost/api/eval/bait', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
      body: JSON.stringify({ question: 'What is faith?' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('INTERNAL');
    // The envelope must never leak the internal message (lib/api-error.ts header).
    expect(JSON.stringify(body)).not.toContain('embedQuery exploded');
    expect(errSpy).toHaveBeenCalled();
    const logged = logSpy.mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes('"evt":"error"') && l.includes('api/eval/bait'))).toBe(true);
  });
});
