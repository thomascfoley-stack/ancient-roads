// PROPERTY (Work Order v2 Stage 3.1): GET /api/health names the corpus the running site is
// actually serving, and reports UNIDENTIFIED as unhealthy rather than as fine.
//
// The corpus is gitignored, has no build step, and is uploaded straight from the operator's
// working directory. Before this endpoint the only way to answer "which content is live?" was
// to infer it from what the deploy was believed to contain — which is not evidence, it is the
// same assumption that let two deploys from one sha carry different libraries.
//
// The trap this suite is aimed at: a health check that answers `ok: true` when it could not
// read the manifest is WORSE than no health check, because it converts "I don't know" into
// "everything is fine" and a monitor will believe it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** What the shipped manifest would say, or an Error the read should fail with. */
let manifestFixture: string | Error = new Error('ENOENT');
let dbRows: Array<{ n: number }> | Error = [{ n: 31 }];

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(async (p: string, enc: string) => {
      if (String(p).endsWith('corpus-manifest.json')) {
        if (manifestFixture instanceof Error) throw manifestFixture;
        return manifestFixture;
      }
      return actual.readFile(p, enc as BufferEncoding);
    }),
  };
});

vi.mock('@/lib/db', () => ({
  getDb: () => () => {
    if (dbRows instanceof Error) throw dbRows;
    return Promise.resolve(dbRows);
  },
}));

/** What the per-IP read throttle answers: null = proceed, a Response = refused (2026-08-17
 *  pre-deploy audit #9). Pass-through by default so the identity cases stay about identity;
 *  that the throttle is WIRED IN AT ALL is asserted from source by api-hardening.test.ts H3,
 *  so mocking it here cannot hide its removal. */
const throttle = vi.hoisted(() => ({ value: null as Response | null }));
vi.mock('@/lib/public-read-limit', () => ({
  publicReadThrottle: vi.fn(async () => throttle.value),
}));

const HEALTHY_MANIFEST = JSON.stringify({
  sha: 'deadbee',
  ts: '2026-07-30T18:51:33.189Z',
  corpusHash: 'a'.repeat(64),
  workCount: 27,
  fileCount: 1234,
});

async function health(): Promise<{ status: number; body: Record<string, unknown>; res: Response }> {
  const { GET } = await import('@/app/api/health/route');
  const res = await GET(new Request('http://localhost/api/health'));
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, res };
}

beforeEach(() => {
  vi.resetModules();
  manifestFixture = HEALTHY_MANIFEST;
  dbRows = [{ n: 31 }];
  throttle.value = null;
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'deadbeefcafe');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/health reports the identity of the deployed corpus', () => {
  it('names the corpus hash, file count, sha and published-work count', async () => {
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      sha: 'deadbeefcafe',
      corpusHash: 'a'.repeat(64),
      corpusFiles: 1234,
      dbReachable: true,
      publishedWorks: 31,
    });
  });

  it('is never cached — a cached health check reports the PREVIOUS deploy', async () => {
    const { res } = await health();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('unidentified is UNHEALTHY, not fine', () => {
  it('ok is false when no manifest shipped, and the hash is null rather than guessed', async () => {
    manifestFixture = new Error('ENOENT: no such file');
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body.corpusHash).toBeNull();
    expect(body.corpusFiles).toBeNull();
    expect(body.ok).toBe(false);
  });

  it('a CORRUPT manifest reads as unidentified, not as a 500', async () => {
    manifestFixture = '{ this is not json';
    const { status, body } = await health();
    expect(status).toBe(200);
    expect(body.corpusHash).toBeNull();
    expect(body.ok).toBe(false);
  });

  it('a manifest with no corpusHash field does not pass as identified', async () => {
    manifestFixture = JSON.stringify({ sha: 'deadbee', fileCount: 1234 });
    const { body } = await health();
    expect(body.corpusHash).toBeNull();
    expect(body.ok).toBe(false);
  });

  it('a manifest with an EMPTY corpusHash does not pass as identified either', async () => {
    manifestFixture = JSON.stringify({ corpusHash: '', fileCount: 1234 });
    const { body } = await health();
    expect(body.corpusHash).toBeNull();
    expect(body.ok).toBe(false);
  });

  it('ok is false when the build sha is unknown', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    vi.stubEnv('GIT_COMMIT_SHA', '');
    const { body } = await health();
    expect(body.sha).toBeNull();
    expect(body.ok).toBe(false);
  });

  it('an env var that is SET BUT EMPTY is not an answer', async () => {
    // The defect this caught: `process.env.X ?? null` yields '' for an empty var, and
    // `'' !== null` is true — so a misconfigured build reported itself as identified.
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '   ');
    vi.stubEnv('GIT_COMMIT_SHA', 'fallback-sha');
    const { body } = await health();
    expect(body.sha).toBe('fallback-sha');
  });
});

describe('a database outage is reported, not hidden and not thrown', () => {
  it('answers 200 with ok:false and names the failing leg', async () => {
    dbRows = new Error('connection refused');
    const { status, body } = await health();
    // A health endpoint that 500s tells a monitor only "something"; this one says which leg.
    expect(status).toBe(200);
    expect(body.dbReachable).toBe(false);
    expect(body.publishedWorks).toBeNull();
    expect(body.ok).toBe(false);
    // The corpus leg is still answered truthfully while the database leg is down.
    expect(body.corpusHash).toBe('a'.repeat(64));
  });
});

describe('the writer and the reader must agree on one path', () => {
  // These two files are the only link between the manifest that is BUILT and the manifest
  // that is SERVED. They are in different languages, different trees, and nothing but this
  // assertion connects them: if the writer's path moves, /api/health silently reports
  // `corpusHash: null` forever and the endpoint becomes decorative.
  const route = readFileSync(path.join(ROOT, 'web/src/app/api/health/route.ts'), 'utf-8');
  const builder = readFileSync(path.join(ROOT, 'scripts/build-corpus-manifest.mjs'), 'utf-8');

  it('the route reads public/corpus-manifest.json and the builder writes it', () => {
    expect(route).toContain('public/corpus-manifest.json');
    expect(builder).toContain("'web/public/corpus-manifest.json'");
  });

  it('the shipped copy is gitignored — the committed record is the docs/evidence one', () => {
    // Committing both is how the two are allowed to disagree.
    expect(readFileSync(path.join(ROOT, '.gitignore'), 'utf-8')).toContain('web/public/corpus-manifest.json');
  });
});

describe('the health check is throttled (#9, 2026-08-17 pre-deploy audit)', () => {
  it('returns the throttle refusal instead of running the count(*)', async () => {
    // Unauthenticated + force-dynamic + one count(*) per request, on the SAME Neon endpoint the
    // fail-closed ask limiter depends on — the coupling public-read-limit.ts exists for. The
    // route's own header admitted it was safe only while the site gate is up.
    // SEED: delete the publicReadThrottle call from the route → this reads 200 and goes RED.
    throttle.value = new Response(JSON.stringify({ error: { code: 'RATE_LIMIT_MINUTE' } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
    // Were the route to ignore the refusal and proceed, the mocked DB would answer and this
    // would be a 200 with a healthy body — so the 429 proves the early return, not the mock.
    const { status } = await health();
    expect(status).toBe(429);
  });
});

describe('/api/health is not a hole in the pre-launch wall', () => {
  it('is absent from PUBLIC_PATHS — it reports the sha and the work count', async () => {
    // The route header claims this; unclaimed, someone adds the entry for a monitor and the
    // gate quietly loses a path. If /api/health is deliberately opened later, update the
    // header and this test together, on purpose.
    const { isPublicPath } = await import('@/lib/gate');
    expect(isPublicPath('/api/health')).toBe(false);
  });
});
