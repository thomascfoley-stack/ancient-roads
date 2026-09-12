// Locks the D11 race fix in processOne's blob-null branch. The race itself needs a real
// Postgres (queue-never-drops.test.ts rule: SKIP LOCKED and concurrent UPDATEs cannot be
// mocked); this asserts the FIX'S SHAPE so a revert goes red without a DB.
import { describe, expect, it } from 'vitest';

const SRC = new URL('../../src/lib/user-corpus/queue.ts', import.meta.url);

describe('D11 race fix — processOne blob-null branch guards the fail-fast', () => {
  it('does NOT fail via the unguarded setDocStatus on a blob-null row', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(SRC, 'utf8'));
    // The unguarded path used to read: setDocStatus(userId, row.id, 'failed', '...was not stored...')
    // inside the `if (!row.blob_url)` block. The fix inlines a guarded UPDATE instead, so this
    // call must NOT appear inside that branch. (setDocStatus remains used elsewhere in processOne.)
    const branch = src.split('if (!row.blob_url)')[1]!.split('try {')[0]!;
    expect(branch, 'the blob-null fail-fast must not call setDocStatus').not.toMatch(/setDocStatus/);
  });

  it('guards the fail-UPDATE with `AND blob_url IS NULL RETURNING id`', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(SRC, 'utf8'));
    const branch = src.split('if (!row.blob_url)')[1]!.split('try {')[0]!;
    expect(branch).toMatch(/status\s*=\s*'failed'/);
    expect(branch).toMatch(/was not stored/);
    expect(branch).toMatch(/AND blob_url IS NULL/i);
    expect(branch).toMatch(/RETURNING id/);
  });

  it('directly requeues with `AND blob_url IS NOT NULL` and decrements attempts', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(SRC, 'utf8'));
    const branch = src.split('if (!row.blob_url)')[1]!.split('try {')[0]!;
    expect(branch).toMatch(/status\s*=\s*'queued'/);
    expect(branch).toMatch(/parse_error\s*=\s*NULL/);
    expect(branch).toMatch(/claimed_at\s*=\s*NULL/);
    expect(branch).toMatch(/attempts\s*=\s*attempts\s*-\s*1/);
    expect(branch).toMatch(/AND blob_url IS NOT NULL/i);
  });

  it('returns queued so the drain loop re-claims and re-processes the row', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(SRC, 'utf8'));
    const branch = src.split('if (!row.blob_url)')[1]!.split('try {')[0]!;
    expect(branch).toMatch(/return 'queued'/);
  });
});
