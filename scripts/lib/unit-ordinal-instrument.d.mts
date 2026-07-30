// Types for unit-ordinal-instrument.mjs — shared core for G10, db-invariants, CLI.
import type pg from 'pg';

export declare const MIGRATION_024: string;
export declare const FORBIDDEN_PROVENANCE_DOMAINS: readonly string[];
export declare const SOURCE_FORBIDDEN_PROVENANCE_SQL: string;
export declare const SECTION_FORBIDDEN_PROVENANCE_SQL: string;
export declare const CLEAN_EXCERPT_WORKS_SQL: string;
export declare const EXCERPT_SECTIONS_SQL: string;

export declare function backfillSqlFromMigration(migrationPath?: string): string;
export declare function perturbBackfillSql(sql: string, perturbation: string): string;
export declare function backfillSelectSql(backfillUpdateSql: string, opts?: { scope?: string }): string;
export declare function pickExcerptSlugs(rows: Array<{ slug: string; source_type: string }>, limit?: number): string[];

export declare function measurePublishedUnitOrdinal(
  client: pg.Client | pg.PoolClient,
  opts?: { backfillSql?: string },
): Promise<{
  ok: boolean;
  errors: string[];
  nulls: number;
  publishedWorks: number;
  digests: Array<{ slug: string; digest: string; sections: number; units: number }>;
  mismatches: object[];
}>;

export declare function rollupDigest(
  digestRows: Array<{ slug: string; digest: string; sections: number; units: number }>,
): string;
