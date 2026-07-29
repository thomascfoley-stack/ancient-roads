// Regression — M4: /api/eval/bait is a paid local-only harness; never reachable in production.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/teacher/teach', () => ({
  teach: vi.fn(async () => ({ kind: 'fallback' })),
}));

describe('bait-route-production-gate (M4)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns 404 in production without calling teach()', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EVAL_HARNESS_SECRET', 'test-secret');
    const { POST } = await import('@/app/api/eval/bait/route');
    const { teach } = await import('@/lib/teacher/teach');
    const req = new NextRequest('http://localhost/api/eval/bait', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
      body: JSON.stringify({ question: 'What is faith?' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(teach).not.toHaveBeenCalled();
  });

  it('returns 503 when EVAL_HARNESS_SECRET is unset (fail closed)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EVAL_HARNESS_SECRET', '');
    const { POST } = await import('@/app/api/eval/bait/route');
    const req = new NextRequest('http://localhost/api/eval/bait', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is faith?' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it('returns 401 for a missing/wrong bearer token in non-production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EVAL_HARNESS_SECRET', 'test-secret');
    const { POST } = await import('@/app/api/eval/bait/route');
    const req = new NextRequest('http://localhost/api/eval/bait', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is faith?' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('truncates question to 500 characters before calling teach()', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('EVAL_HARNESS_SECRET', 'test-secret');
    const { POST } = await import('@/app/api/eval/bait/route');
    const { teach } = await import('@/lib/teacher/teach');
    const longQ = 'x'.repeat(600);
    const req = new NextRequest('http://localhost/api/eval/bait', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
      body: JSON.stringify({ question: longQ }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(teach).toHaveBeenCalledWith('x'.repeat(500));
  });
});
