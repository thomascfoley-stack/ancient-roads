/** Neon branch ids that may not be deleted without an owner ruling in docs/DECISIONS.md. */
export const PROTECTED_BRANCH_IDS = new Set([
  'br-late-recipe-atxl68sh', // pre-cutover-ep-odd-fog-atnykudm-20260729164220 (2026-07-29 prod snapshot)
]);

export function refuseProtectedBranchDelete(branchId, context = 'branch delete') {
  if (PROTECTED_BRANCH_IDS.has(branchId)) {
    throw new Error(
      `REFUSING ${context}: Neon branch ${branchId} is PROTECTED (docs/CUTOVER_DESIGN.md PROTECTED BRANCHES). `
      + 'Deletion requires an owner ruling recorded in docs/DECISIONS.md.',
    );
  }
}

/** Refuse if a branch name/id matches a protected rollback snapshot pattern. */
export function refuseProtectedBranchPattern(nameOrId, context = 'branch delete') {
  const s = String(nameOrId ?? '');
  if (PROTECTED_BRANCH_IDS.has(s)) refuseProtectedBranchDelete(s, context);
  if (/^pre-cutover-ep-odd-fog-/i.test(s)) {
    throw new Error(
      `REFUSING ${context}: name ${s} matches the protected pre-cutover prod snapshot pattern. `
      + 'See docs/CUTOVER_DESIGN.md PROTECTED BRANCHES.',
    );
  }
}
