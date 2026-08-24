// asserted_ownership_at — the upload-time ownership assertion (UPLOADER_DESIGN.md §5/Q7,
// migration 128, W-OWNERSHIPCOL).
//
// Three properties, each of which can fail:
//  1. createDocument records the assertion timestamp (the server half).
//  2. The UI sentence sits beside the ONLY upload entry point (the honesty half — without it
//     the timestamp records an assertion never made).
//  3. Pre-column rows read NULL — the design forbids backfilling an assertion.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { announceSkip } from '../helpers/loud-skip';
import { runtimeDbUrl } from '../helpers/env';

const dbUrl = runtimeDbUrl();
const WEB = path.resolve(__dirname, '..', '..');

describe('asserted_ownership_at (UPLOADER_DESIGN §5/Q7)', () => {
  it('the ownership sentence renders beside the upload control, and the INSERT records it', () => {
    // Static, deliberately: the sentence and the INSERT live in different files, and the
    // property is their CONJUNCTION — either alone is a defect (a silent timestamp, or an
    // assertion shown but never recorded).
    const ui = readFileSync(path.join(WEB, 'src/components/my-works.tsx'), 'utf8');
    expect(ui).toMatch(/affirm this is your own work/);
    const lib = readFileSync(path.join(WEB, 'src/lib/user-corpus/documents.ts'), 'utf8');
    const insert = lib.slice(lib.indexOf('INSERT INTO user_documents'));
    expect(insert).toMatch(/asserted_ownership_at/);
    expect(insert.slice(0, insert.indexOf('RETURNING'))).toMatch(/now\(\)/);
  });

  it('createDocument writes a non-NULL assertion timestamp (dev DB)', async () => {
    if (!dbUrl) {
      announceSkip('ownership-assertion DB leg', [{ name: 'DATABASE_URL', present: false, kind: 'secret' }], 'the live INSERT');
      return;
    }
    const { createDocument } = await import('@/lib/user-corpus/documents');
    const { runAsUser } = await import('@/lib/db');
    const USER = 'test-ownership-assertion';
    const doc = await createDocument(USER, {
      title: 'ownership probe', filename: 'probe.txt', byteSize: 1,
      checksum: `probe-${Date.now()}`, mimeType: 'txt',
    });
    try {
      const [rows] = await runAsUser(USER, (sql) => [
        sql`SELECT asserted_ownership_at FROM user_documents WHERE user_id = ${USER} AND id = ${doc.id}`,
      ]);
      const at = (rows as { asserted_ownership_at: string | null }[])[0]?.asserted_ownership_at;
      expect(at, 'upload past the sentence must record the assertion').not.toBeNull();
      expect(new Date(at!).getTime()).toBeGreaterThan(Date.now() - 60_000);
    } finally {
      await runAsUser(USER, (sql) => [
        sql`DELETE FROM user_documents WHERE user_id = ${USER} AND id = ${doc.id}`,
      ]);
    }
  });
});
