// One definition of "is this a thread id", shared by the server (lib/research) and the client
// (thread-restore). The regex lives in lib/thread-id so a client component can import it without
// pulling the research store — and lib/research re-exports it so its importers do not change.
import { describe, expect, it } from 'vitest';
import { isThreadId, UUID_RE } from '@/lib/thread-id';
import { isThreadId as fromResearch } from '@/lib/research';

describe('isThreadId', () => {
  it('accepts a uuid in either case', () => {
    expect(isThreadId('6f1d2c3b-4a5e-4f60-8b71-9c2d3e4f5a6b')).toBe(true);
    expect(isThreadId('6F1D2C3B-4A5E-4F60-8B71-9C2D3E4F5A6B')).toBe(true);
    expect(UUID_RE.test('6f1d2c3b-4a5e-4f60-8b71-9c2d3e4f5a6b')).toBe(true);
  });

  it('rejects every malformed shape', () => {
    for (const bad of ['', 'not-a-uuid', '6f1d2c3b-4a5e-4f60-8b71', '../evil', '6f1d2c3b-4a5e-4f60-8b71-9c2d3e4f5a6b/x', ' 6f1d2c3b-4a5e-4f60-8b71-9c2d3e4f5a6b']) {
      expect(isThreadId(bad), bad).toBe(false);
    }
  });

  it('is the SAME function lib/research exports (one definition, not two that can drift)', () => {
    expect(fromResearch).toBe(isThreadId);
  });
});
