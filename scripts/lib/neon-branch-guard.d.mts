// Types for neon-branch-guard.mjs (reads docs/PROTECTED_BRANCHES.json).

export declare const PROTECTED_BRANCH_IDS: Set<string>;

export declare function protectedBranchEntry(
  branchId: string,
): { id: string; name?: string; rollback_for?: string } | undefined;

export declare function refuseProtectedBranchDelete(branchId: string, context?: string): void;

export declare function refuseProtectedBranchPattern(nameOrId: string, context?: string): void;
