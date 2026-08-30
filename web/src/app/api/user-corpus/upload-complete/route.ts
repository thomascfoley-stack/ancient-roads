import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { getUserDocument, deleteUserDocument, blobPathname } from '@/lib/user-corpus/blob';
import { createDocument, findByChecksum, setBlobPathname, DuplicateDocument } from '@/lib/user-corpus/documents';
import { checksum, sniffType } from '@/lib/user-corpus/sniff';
import { drain } from '@/lib/user-corpus/queue';
import { QuotaExceeded } from '@/lib/user-corpus/quota';
import { UploadRefused } from '@/lib/user-corpus/types';

// Records a document whose bytes were uploaded directly to Vercel Blob via a
// presigned URL (see upload-url/route.ts). The function never saw the bytes in
// flight — it reads them back from the store to sniff, checksum, and queue.
//
// The two-call flow (upload-url → browser PUT → upload-complete) bypasses the
// serverless function's ~4 MB body cap (413 confirmed on production,
// docs/evidence/f134-probe-2026-08-30.txt).

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;

  let pathname = '';
  let name = '';
  try {
    const body = (await req.json()) as { pathname?: unknown; name?: unknown };
    pathname = typeof body.pathname === 'string' ? body.pathname : '';
    name = typeof body.name === 'string' ? body.name.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Send JSON: { pathname, name }.' }, { status: 400 });
  }
  if (!pathname) return NextResponse.json({ error: 'A pathname is required.' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'A filename is required.' }, { status: 400 });

  // The pathname must be user-scoped — a caller cannot record a document against
  // another user's prefix.
  if (!pathname.startsWith(`user-corpus/${user.id}/`)) {
    return NextResponse.json({ error: 'That pathname is not yours.' }, { status: 403 });
  }

  try {
    // Read the bytes back from the store. This is what makes the direct upload
    // verifiable: a forged pathname fails here, and a partial upload reads as
    // truncated rather than silently accepted.
    const bytes = await getUserDocument(pathname);
    const type = sniffType(bytes, name);
    const sum = await checksum(bytes);

    // Dedupe — same rule as the original route. If the bytes already exist, the
    // new blob is orphaned; delete it before returning the existing document.
    const existing = await findByChecksum(user.id, sum);
    if (existing) {
      await deleteUserDocument(pathname).catch((e) => {
        console.error('[upload-complete] could not delete orphaned blob:', (e as Error).message);
      });
      return NextResponse.json(
        { document: existing, duplicateOf: existing.id, message: 'You have already uploaded this file.' },
        { status: 200 },
      );
    }

    const documentId = pathname.split('/').pop()!;
    const created = await createDocument(user.id, {
      title: name.replace(/\.[^.]+$/, '') || name,
      filename: name,
      byteSize: bytes.byteLength,
      checksum: sum,
      mimeType: type,
    }).catch((e: unknown) => {
      if (e instanceof DuplicateDocument) return e;
      throw e;
    });
    if (created instanceof DuplicateDocument) {
      await deleteUserDocument(pathname).catch((e) => {
        console.error('[upload-complete] could not delete orphaned blob:', (e as Error).message);
      });
      return NextResponse.json(
        { document: created.existing, duplicateOf: created.existing.id, message: 'You have already uploaded this file.' },
        { status: 200 },
      );
    }
    const doc = created;

    await setBlobPathname(user.id, doc.id, pathname);

    // Fire-and-forget drain — same contract as the original route. The upload
    // has succeeded; a scheduling failure must not turn into a 500.
    try {
      after(async () => {
        try {
          await drain(user.id);
        } catch (e) {
          console.error('[user-corpus] drain failed after upload-complete:', String((e as Error)?.message ?? e));
        }
      });
    } catch (e) {
      console.error('[user-corpus] could not schedule the drain:', String((e as Error)?.message ?? e));
    }

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (e) {
    if (e instanceof QuotaExceeded) {
      return NextResponse.json({ error: e.message, code: 'quota_exceeded' }, { status: 403 });
    }
    if (e instanceof UploadRefused) {
      const status = e.code === 'too_large' || e.code === 'too_large_decompressed' ? 413
        : e.code === 'unsupported_type' ? 415
        : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error('[user-corpus] upload-complete failed:', String((e as Error)?.message ?? e));
    return NextResponse.json({ error: 'The upload could not be completed.' }, { status: 500 });
  }
}
