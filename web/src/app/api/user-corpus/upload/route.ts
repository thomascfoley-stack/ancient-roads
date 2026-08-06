import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { putUserDocument } from '@/lib/user-corpus/blob';
import { createDocument, findByChecksum, setBlobPathname } from '@/lib/user-corpus/documents';
import { drain } from '@/lib/user-corpus/queue';
import { assertWithinSizeCap, checksum, sniffType } from '@/lib/user-corpus/sniff';
import { UploadRefused } from '@/lib/user-corpus/types';

// zlib (the docx reader) and pdfjs both need Node, not the edge runtime.
export const runtime = 'nodejs';

// NOTE ON maxDuration, deliberately NOT exported here. Every `maxDuration` segment config under
// web/src/app is held equal to ASK_MAX_DURATION_SEC by test/ask-max-duration-literal.test.ts,
// because for the ask routes the ceiling and the in-process budget are one number with two
// consumers. Parsing has no such relationship to the ask budget, and adding a third consumer with
// unrelated semantics would make that guard mean less. The cost is that a very large PDF can
// exceed the platform default and have its function killed mid-parse -- which is survivable and
// VISIBLE rather than silent: the row stays in 'parsing' and queue.ts's stale-claim rule reclaims
// it by age. Recorded in WORKLOG as a step-2 limitation.

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Attach a file in the "file" field.' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    assertWithinSizeCap(bytes.byteLength);
    // Sniffed here as well as in the parser so an unsupported file is refused at the door with a
    // 400, rather than accepted, stored, queued, and failed asynchronously. Same function, so the
    // two answers cannot disagree.
    const type = sniffType(bytes, file.name);
    const sum = await checksum(bytes);

    // Dedupe (§8: "they keep Rom8-FINAL-v2-USETHIS.docx"). Checked before insert so the response
    // can say WHICH document it already is, rather than surfacing a unique-constraint violation.
    const existing = await findByChecksum(user.id, sum);
    if (existing) {
      return NextResponse.json(
        { document: existing, duplicateOf: existing.id, message: 'You have already uploaded this file.' },
        { status: 200 },
      );
    }

    // The row is created BEFORE the bytes are stored: a failure between the two leaves a visible
    // row in 'queued' with no blob, which the drain turns into a stated failure. The reverse order
    // can leave a stored file that no row names.
    const doc = await createDocument(user.id, {
      title: file.name.replace(/\.[^.]+$/, '') || file.name,
      filename: file.name,
      byteSize: bytes.byteLength,
      checksum: sum,
      mimeType: type,
    });

    const pathname = await putUserDocument(user.id, doc.id, bytes);
    await setBlobPathname(user.id, doc.id, pathname);

    // Fire-and-forget (§8, and the order: "use the fire-and-forget drain kicked on upload; do not
    // wait for cron"). `after` runs once the response is sent, so the upload returns immediately
    // with a 'queued' document and the client polls for status.
    //
    // THE KICK IS BEST-EFFORT AND MUST NOT BE ABLE TO FAIL THE UPLOAD. By this line the row exists
    // and the bytes are stored — the upload has SUCCEEDED. Found by exercising the route for the
    // first time: `after()` throws outside a request scope, that throw reached the catch below, and
    // the caller got a 500 reading "The upload could not be completed" about a document that was
    // sitting in the queue, correctly. An error message that contradicts the database is worse than
    // a slow queue, and the queue already tolerates a missed kick: the document stays 'queued' and
    // the next upload's drain, or a retry, collects it.
    try {
      after(async () => {
        try {
          await drain(user.id);
        } catch (e) {
          // The drain writes a status for every document it claims, so a throw here means the drain
          // itself failed rather than a document. Log it; the stale-claim rule reclaims anything
          // left mid-flight.
          console.error('[user-corpus] drain failed after upload:', String((e as Error)?.message ?? e));
        }
      });
    } catch (e) {
      console.error('[user-corpus] could not schedule the drain; document stays queued:', String((e as Error)?.message ?? e));
    }

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (e) {
    if (e instanceof UploadRefused) {
      // 413 for the size caps, 415 for a type we do not accept, 400 for the rest. A refusal at
      // this stage never creates a row -- nothing was accepted, so there is nothing to report a
      // status for.
      const status = e.code === 'too_large' || e.code === 'too_large_decompressed' ? 413
        : e.code === 'unsupported_type' ? 415
        : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error('[user-corpus] upload failed:', String((e as Error)?.message ?? e));
    return NextResponse.json({ error: 'The upload could not be completed.' }, { status: 500 });
  }
}
