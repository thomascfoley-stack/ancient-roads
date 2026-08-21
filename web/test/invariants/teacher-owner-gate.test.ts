// THE TEACHER IS OWNER-ONLY DURING GATED BETA (ADR-116 ruling 3).
//
// interpretation_bait is 100/100 clean = a ~97% lower bound by rule of three, against a >=99%
// bar. That is honest evidence for ~97%, not for the bar — so the compose path may not be
// generally available yet. The site password gate does NOT provide this: a beta user has the
// password by definition, and before this gate existed BOTH ask routes called requireUser()
// alone, i.e. ANY authenticated user reached the teacher.
//
// FAIL-CLOSED BY DESIGN: with TEACHER_ALLOWLIST unset, nobody is allowed — including the owner.
// The alternative (unset => everyone) would mean a single missing env var in production
// silently reopens the surface this ADR closed, and it would fail open exactly when someone
// forgot something. An empty allowlist is a disabled teacher, which is a safe thing to be.

import { afterEach, describe, expect, it } from 'vitest';
import { isTeacherAllowed } from '@/lib/teacher-access';

const ORIGINAL = process.env.TEACHER_ALLOWLIST;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TEACHER_ALLOWLIST;
  else process.env.TEACHER_ALLOWLIST = ORIGINAL;
});

describe('teacher owner-gate (ADR-116 ruling 3)', () => {
  it('FAILS CLOSED: an unset allowlist admits nobody, not everybody', () => {
    delete process.env.TEACHER_ALLOWLIST;
    // SEED: `return true` on the unset branch and this goes green while production is open.
    expect(isTeacherAllowed({ id: 'u1', email: 'owner@example.test' })).toBe(false);
    expect(isTeacherAllowed({ id: 'u2', email: 'stranger@example.test' })).toBe(false);
  });

  it('an empty or whitespace allowlist also admits nobody', () => {
    process.env.TEACHER_ALLOWLIST = '   ,  , ';
    expect(isTeacherAllowed({ id: 'u1', email: 'owner@example.test' })).toBe(false);
  });

  it('admits a listed email and refuses an unlisted one', () => {
    process.env.TEACHER_ALLOWLIST = 'owner@example.test';
    expect(isTeacherAllowed({ id: 'u1', email: 'owner@example.test' })).toBe(true);
    // THE WHOLE POINT: an authenticated beta user is still refused.
    expect(isTeacherAllowed({ id: 'u2', email: 'beta-user@example.test' })).toBe(false);
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    process.env.TEACHER_ALLOWLIST = ' Owner@Example.TEST , second@example.test ';
    expect(isTeacherAllowed({ id: 'u1', email: 'owner@example.test' })).toBe(true);
    expect(isTeacherAllowed({ id: 'u2', email: 'SECOND@EXAMPLE.TEST' })).toBe(true);
    expect(isTeacherAllowed({ id: 'u3', email: 'third@example.test' })).toBe(false);
  });

  it('admits by user id too, so an email change does not lock the owner out', () => {
    process.env.TEACHER_ALLOWLIST = 'user_abc123';
    expect(isTeacherAllowed({ id: 'user_abc123', email: 'anything@example.test' })).toBe(true);
  });

  it('is not fooled by a substring or a suffix', () => {
    process.env.TEACHER_ALLOWLIST = 'owner@example.test';
    // SEED: implement with `.includes()` instead of an exact set membership and these pass
    // wrongly — `evil-owner@example.test.attacker.com` contains the allowed string.
    expect(isTeacherAllowed({ id: 'u1', email: 'evil-owner@example.test.attacker.com' })).toBe(false);
    expect(isTeacherAllowed({ id: 'u2', email: 'notowner@example.test' })).toBe(false);
    expect(isTeacherAllowed({ id: 'u3', email: 'owner@example.tes' })).toBe(false);
  });
});
