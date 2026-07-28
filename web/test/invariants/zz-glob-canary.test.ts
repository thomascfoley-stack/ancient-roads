// THROWAWAY (§1d, 2026-07-29). Exists only to prove the db-invariants glob picks up a NEW
// invariant with NO workflow edit. Deleted in the same slice that added it.
import { describe, expect, it } from 'vitest';
describe('glob canary', () => {
  it('is covered by CI without anyone editing audit.yml', () => { expect(true).toBe(true); });
});
