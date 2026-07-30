// Regression — M4 → work-order v2 Stage 1.5: /api/eval/bait is secret-gated in all envs;
// production admits bearer-authenticated callers (also behind SITE_PASSWORD middleware).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/teacher/teach', () => ({
  teach: vi.fn(async () => ({ result: { kind: 'fallback', retrieval: [], violations: [] }, meta: { attempts: 1, voices: 0, traditions: 0 } })),
}));

describe('bait-route-production-gate (Stage 1.5)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns 401 in production without bearer token (not 404)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EVAL_HARNESS_SECRET', 'test-secret');
    const { POST } = await import('@/app/api/eval/bait/route');
    const { teach } = await import('@/lib/teacher/teach');
    const req = new NextRequest('http://localhost/api/eval/bait', {
      method: 'POST',
      body: JSON.stringify({ question: 'What is faith?' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
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

  it('admits bearer-authenticated callers in production', async () => {
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
    expect(res.status).toBe(200);
    expect(teach).toHaveBeenCalledWith('What is faith?');
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
