// Types for unit-ordinal-instrument.mjs — shared core for G10, db-invariants, CLI.
import type pg from 'pg';

export declare const MIGRATION_024: string;
export declare const MIGRATION_023: string;

export declare function sourceStatusCohorts(migrationPath?: string): string[];
export declare function assertCohort(cohort: string | undefined, migrationPath?: string): string;

export declare function backfillSqlFromMigration(migrationPath?: string): string;
export declare function perturbBackfillSql(sql: string, perturbation: string): string;
export declare function backfillSelectSql(backfillUpdateSql: string, opts?: { scope?: string }): string;

export declare const COHORT_NULLS_SQL: string;
export declare const COHORT_DUP_PAIRS_SQL: string;
export declare const COHORT_ORDER_BREAKS_SQL: string;
export declare const COHORT_DIGEST_SQL: string;
export declare const COHORT_POSITIVE_CONTROL_SQL: string;

/**
 * The instrument only ever calls `.query`. Typing the parameter that way (rather than as
 * pg.Client) is what lets a test drive it with a stand-in — the reason the old inline
 * version could only be exercised by connecting to a real database.
 */
export interface QueryableClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, never>> } | { rows: never[] } | { rows: unknown[] }>;
}

export interface CohortMeasurement {
  cohort: string;
  ok: boolean;
  errors: string[];
  nulls: number;
  cohortWorks: number;
  digests: Array<{ slug: string; digest: string; sections: number; units: number }>;
  mismatches: object[];
}

export declare function measureUnitOrdinalForCohort(
  client: pg.Client | pg.PoolClient | QueryableClient,
  opts: { cohort: string; backfillSql?: string },
): Promise<CohortMeasurement>;

export declare function measurePublishedUnitOrdinal(
  client: pg.Client | pg.PoolClient | QueryableClient,
  opts?: { backfillSql?: string },
): Promise<CohortMeasurement & { publishedWorks: number }>;

export declare function renderReportText(
  report: {
    cohort: string;
    ts: string;
    target?: string;
    cohortWorks?: number;
    ok: boolean;
    rollupDigest?: string;
    excerptHeader?: string;
    excerptSampleSlugs?: string[];
    errors?: string[];
    excerpts?: Record<string, Array<{ unit_ordinal: number; ordinal: number; heading: string | null }>>;
  },
  renderExcerptLines: (rows: Array<{ unit_ordinal: number; ordinal: number; heading: string | null }>) => string[],
): string;

export declare function rollupDigest(
  digestRows: Array<{ slug: string; digest: string; sections: number; units: number }>,
): string;
