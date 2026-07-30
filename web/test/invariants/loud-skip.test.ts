// REQUIRE_SECRETS vs gitignored artifacts (work-order v2 PR #44 follow-up).
import { describe, expect, it } from 'vitest';
import { announceSkip } from '../helpers/loud-skip';

describe('loud-skip: secrets fail closed, artifacts loud-skip', () => {
  it('REQUIRE_SECRETS=1 + missing secret throws', () => {
    const prev = process.env.REQUIRE_SECRETS;
    process.env.REQUIRE_SECRETS = '1';
    try {
      expect(() =>
        announceSkip('secret-check', [{ name: 'FAKE_SECRET', present: false }], 'coverage'),
      ).toThrow(/REQUIRE_SECRETS.*FAKE_SECRET/);
    } finally {
      if (prev === undefined) delete process.env.REQUIRE_SECRETS;
      else process.env.REQUIRE_SECRETS = prev;
    }
  });

  it('REQUIRE_SECRETS=1 + missing artifact only returns skip (no throw)', () => {
    const prev = process.env.REQUIRE_SECRETS;
    process.env.REQUIRE_SECRETS = '1';
    try {
      const skip = announceSkip(
        '§3 verse-key distribution',
        [{
          name: 'web/public/commentaries (gitignored static corpus)',
          present: false,
          kind: 'artifact',
        }],
        'verse-key collapse',
      );
      expect(skip).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.REQUIRE_SECRETS;
      else process.env.REQUIRE_SECRETS = prev;
    }
  });
});
