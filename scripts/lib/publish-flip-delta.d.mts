// Types for publish-flip-delta.mjs.
export interface SourceRow {
  slug: string;
  status: string;
}
export declare function eligibility(
  slugs: readonly string[],
  beforeBy: ReadonlyMap<string, string>,
  from: string,
  to: string,
): { missing: string[]; eligible: string[]; already: string[]; thirdStatus: string[] };
export declare function flipDelta(
  before: readonly SourceRow[],
  after: readonly SourceRow[],
  named: Iterable<string>,
  from: string,
  to: string,
): string[];
