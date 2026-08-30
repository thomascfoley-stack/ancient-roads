import { NextResponse, type NextRequest } from 'next/server';
import { checkCorpusUploadRateLimit } from '@/lib/rate-limit';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { checkUploadQuota, QuotaExceeded } from '@/lib/user-corpus/quota';
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

// Issues a presigned PUT URL so the browser can upload directly to Vercel Blob,
// bypassing the serverless function's body cap (~4 MB, confirmed 413 on production
// via /api/gate probe — docs/evidence/f134-probe-2026-08-30.txt).
//
// The function never sees the bytes. It validates metadata, checks quota and rate
// limits, and returns a short-lived, single-purpose URL the browser PUTs to.
// The store stays private: the browser never sees BLOB_READ_WRITE_TOKEN, and the
// presigned URL cannot read, list, or delete.

export const runtime = 'nodejs';

const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'md']);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // restored — the platform cap no longer applies

function ext(name: string): string {
  return /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;

  const limit = await checkCorpusUploadRateLimit(user.id);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many uploads. Please wait a moment and try again.', retryAfterSec: limit.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec ?? 60) } },
    );
  }

  let name = '';
  let size = 0;
  try {
    const body = (await req.json()) as { name?: unknown; size?: unknown };
    name = typeof body.name === 'string' ? body.name.trim() : '';
    size = typeof body.size === 'number' && Number.isFinite(body.size) ? body.size : 0;
  } catch {
    return NextResponse.json({ error: 'Send JSON: { name, size }.' }, { status: 400 });
  }

  if (!name) return NextResponse.json({ error: 'A filename is required.' }, { status: 400 });
  if (size <= 0) return NextResponse.json({ error: 'A file size is required.' }, { status: 400 });
  if (size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Larger than the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit.` },
      { status: 400 },
    );
  }
  const extension = ext(name);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: `.${extension} files cannot be read here — PDF, Word (.docx), text or Markdown only.` },
      { status: 400 },
    );
  }

  // Quota is checked BEFORE the presign — refusing here costs one SELECT and no bytes
  // transferred. Checking it in upload-complete (after the file lands) would still be
  // enforced, but the blob would already be stored and the catch would have to delete it.
  const quota = await checkUploadQuota(user.id, size);
  if (!quota.ok) {
    return NextResponse.json(
      { error: quota.message, code: 'quota_exceeded' },
      { status: 403 },
    );
  }

  const documentId = randomUUID();
  const pathname = `user-corpus/${user.id}/${documentId}`;

  try {
    const signedToken = await issueSignedToken({
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      pathname,
      operations: ['put'],
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: 'put',
      pathname,
      access: 'private',
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
      allowedContentTypes: ['application/octet-stream'],
      // The pathname must be recoverable from (userId, documentId) — a random suffix
      // makes the stored blob unreachable by the pathname upload-complete receives.
      addRandomSuffix: false,
    });
    return NextResponse.json({ uploadUrl: presignedUrl, pathname, documentId });
  } catch (e) {
    console.error('[upload-url] presign failed:', (e as Error).message);
    return NextResponse.json(
      { error: 'The upload could not be prepared. Please try again.' },
      { status: 503 },
    );
  }
}
