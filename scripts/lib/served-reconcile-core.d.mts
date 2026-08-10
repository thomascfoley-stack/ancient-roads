// Types for served-reconcile-core.mjs.
export interface WorkServedRow {
  work: string;
  rows: number;
  served: number;
  unservedClean?: number;
  unservedForbidden?: number;
}
export interface SourceStatusRow {
  slug: string;
  status: string;
}
export interface ReconcileViolation {
  kind: 'published-not-fully-served' | 'unpublished-serving' | 'no-sources-row-serving';
  work: string;
  status?: string;
  detail: string;
}
export declare function reconcile(
  works: WorkServedRow[],
  sources: SourceStatusRow[],
): {
  violations: ReconcileViolation[];
  e3Deferred: { work: string; rows: number }[];
  inertOrphans: { work: string; rows: number }[];
  ok: { publishedServed: number; unpublishedUnserved: number };
  publishedWorkless: string[];
};
