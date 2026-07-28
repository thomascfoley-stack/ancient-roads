// Types for user-data-invariant.mjs (see that file for why the invariant is a digest
// and not a count). The implementation stays .mjs so the orchestrator, which runs under
// plain `node`, and the gate, which runs under tsx, share one definition.

export interface UserTableMeasure {
  rows: number;
  users: number;
  active: number;
  digest: string;
  owners: Record<string, number>;
}

export type UserDataMeasure = Record<string, UserTableMeasure>;

export declare const USER_TABLES: string[];

export declare const USER_TABLE_SPEC: Record<string, {
  anchor: string[];
  tombstone: string | null;
  active: string;
  body: string[];
}>;

/** counts + active count + ordered-row md5 digest for one table. */
export declare function measureSql(table: string): string;

/** rows-per-owner, keyed by a truncated hash of the account id. */
export declare function ownersSql(table: string): string;

export declare const ABSENT: UserTableMeasure;

export declare function userShape(m: UserDataMeasure): string;

/** Every way `now` differs from `base`, as human sentences. Empty == unchanged. */
export declare function diffUserData(
  base: UserDataMeasure | undefined,
  now: UserDataMeasure,
): string[];
