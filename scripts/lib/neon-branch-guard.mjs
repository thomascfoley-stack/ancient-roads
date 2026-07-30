/** Neon branch ids that may not be deleted without an owner ruling in docs/DECISIONS.md. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REGISTRY = JSON.parse(
  readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/PROTECTED_BRANCHES.json'),
    'utf8',
  ),
);

/** @type {Map<string, { id: string; name?: string; rollback_for?: string }>} */
const BY_ID = new Map(REGISTRY.branches.map((b) => [b.id, b]));

export const PROTECTED_BRANCH_IDS = new Set(BY_ID.keys());

export function protectedBranchEntry(branchId) {
  return BY_ID.get(branchId);
}

export function refuseProtectedBranchDelete(branchId, context = 'branch delete') {
  const entry = BY_ID.get(branchId);
  if (entry) {
    throw new Error(
      `REFUSING ${context}: Neon branch ${branchId} is PROTECTED (docs/PROTECTED_BRANCHES.json). `
      + `Rollback for: ${entry.rollback_for ?? entry.name ?? 'see registry'}. `
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
      + 'See docs/PROTECTED_BRANCHES.json.',
    );
  }
}
