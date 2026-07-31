import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// CORPUS IDENTITY AT RUNTIME (Work Order v2 Stage 3.1).
//
// The corpus is gitignored, has no build step, and is uploaded straight from the operator's
// working directory by `vercel --prod`. So after a deploy there has been no way to ask the
// running site WHICH corpus it is serving — only to infer it from what the deploy was
// believed to contain. This endpoint answers that from the deployed artifact itself.
//
// `corpusHash` is read from the manifest that shipped alongside the corpus, not recomputed:
// walking ~380MB of JSON on a request is not something a health check may do. It is
// therefore an assertion about what the DEPLOY carried, which is exactly the fact that was
// previously unrecoverable.
//
// NOT added to PUBLIC_PATHS in lib/gate.ts. It therefore sits behind the pre-launch site
// password like the rest of the app, and an unauthenticated monitor cannot poll it yet.
// That is deliberate: every PUBLIC_PATHS entry is a hole in the wall, and this route
// reports the build sha and the published-work count. Widening the wall was not part of
// this work order. To allow external monitoring later, add '/api/health' to that set and
// keep web/test/middleware-gate.test.ts green.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CorpusManifestShape {
  corpusHash?: string;
  fileCount?: number;
  workCount?: number;
}

async function readCorpusHash(): Promise<{ corpusHash: string | null; corpusFiles: number | null }> {
  try {
    // The build copies the newest corpus manifest to this path; absent means "not recorded",
    // which is reported as null rather than guessed at.
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(`${process.cwd()}/public/corpus-manifest.json`, 'utf-8');
    const m = JSON.parse(raw) as CorpusManifestShape;
    // Same rule as the sha: a present-but-empty hash is not an identification.
    const hash = typeof m.corpusHash === 'string' && m.corpusHash.trim() !== '' ? m.corpusHash : null;
    return { corpusHash: hash, corpusFiles: typeof m.fileCount === 'number' ? m.fileCount : null };
  } catch {
    return { corpusHash: null, corpusFiles: null };
  }
}

/** An env var that is SET BUT EMPTY is not an answer. `??` would let `VERCEL_GIT_COMMIT_SHA=''`
 *  — the shape a misconfigured or non-Vercel build produces — report as an identified build. */
function envOrNull(...names: string[]): string | null {
  for (const n of names) {
    const v = process.env[n];
    if (v !== undefined && v.trim() !== '') return v;
  }
  return null;
}

export async function GET() {
  const sha = envOrNull('VERCEL_GIT_COMMIT_SHA', 'GIT_COMMIT_SHA');
  const { corpusHash, corpusFiles } = await readCorpusHash();

  let dbReachable = false;
  let publishedWorks: number | null = null;
  try {
    const sql = getDb();
    const rows = (await sql`SELECT count(*)::int AS n FROM sources WHERE status = 'published'`) as Array<{ n: number }>;
    dbReachable = true;
    publishedWorks = rows[0]?.n ?? 0;
  } catch {
    // A health endpoint that 500s when the database is down tells a monitor less than one
    // that answers truthfully about which leg is broken. `ok` reflects it; the request does not fail.
    dbReachable = false;
  }

  const ok = dbReachable && sha !== null && corpusHash !== null;

  return NextResponse.json(
    { ok, sha, corpusHash, corpusFiles, dbReachable, publishedWorks },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
