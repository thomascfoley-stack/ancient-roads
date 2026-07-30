// Protected Neon branches must refuse deletion via the sanctioned guard path.
import { describe, expect, it } from 'vitest';
import {
  PROTECTED_BRANCH_IDS,
  refuseProtectedBranchDelete,
  refuseProtectedBranchPattern,
} from '../../scripts/lib/neon-branch-guard.mjs';

describe('neon-branch-guard: registered ids refuse deletion', () => {
  it('registry includes br-late-recipe-atxl68sh', () => {
    expect(PROTECTED_BRANCH_IDS.has('br-late-recipe-atxl68sh')).toBe(true);
  });

  it('refuses deletion of a registered branch id', () => {
    expect(() => refuseProtectedBranchDelete('br-late-recipe-atxl68sh')).toThrow(/REFUSING branch delete/);
    expect(() => refuseProtectedBranchDelete('br-late-recipe-atxl68sh')).toThrow(/PROTECTED_BRANCHES\.json/);
  });

  it('refuses deletion of a protected pre-cutover name pattern', () => {
    expect(() =>
      refuseProtectedBranchPattern('pre-cutover-ep-odd-fog-atnykudm-20260729164220'),
    ).toThrow(/REFUSING branch delete/);
  });

  it('allows deletion of an unregistered disposable id', () => {
    expect(() => refuseProtectedBranchDelete('br-disposable-test-00000000')).not.toThrow();
    expect(() => refuseProtectedBranchPattern('br-disposable-test-00000000')).not.toThrow();
  });
});
