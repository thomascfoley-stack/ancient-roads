// Types for excerpt-sample-policy.mjs. The implementation stays .mjs so the read-only
// production instrument can import it under plain `node` — see the header there.
export interface ManifestEntry {
  id: string;
  quarantine?: string;
  provenance?: { url?: string };
  backfill?: { forbidden_provenance?: string; forbidden_provenance_reason?: string };
}

export interface PublishedSourceRow {
  slug: string;
  source_type: string;
  status: string;
  provenance?: { url?: string };
}

export interface ExcerptEligibility {
  slug: string;
  source_type: string;
  eligible: boolean;
  reason: string;
}

export interface SectionScan {
  rows: Array<{ slug: string; source_url: string | null }>;
  truncated: boolean;
}

export interface ExcerptRow {
  unit_ordinal: number;
  ordinal: number;
  heading: string | null;
}

export declare function loadManifestById(manifestPath?: string): Map<string, ManifestEntry>;

export declare function excerptEligibility(
  source: PublishedSourceRow,
  manifestEntry: ManifestEntry | undefined,
  forbiddenSectionRowCount: number,
): ExcerptEligibility;

export declare function pickExcerptSlugs(rows: ExcerptEligibility[], limit?: number): string[];

export declare function countForbiddenSectionRows(
  sectionRows: Array<{ slug: string; source_url: string | null }>,
): Map<string, number>;

export declare function buildExcerptReport(
  sources: PublishedSourceRow[],
  sectionScan: SectionScan,
  manifest: Map<string, ManifestEntry>,
): {
  eligibility: ExcerptEligibility[];
  sampleSlugs: string[];
  header: string;
  eligibleCount: number;
  scanTruncated: boolean;
};

export declare function formatExcerptLine(u: ExcerptRow): string;
export declare function renderExcerptLines(rows: ExcerptRow[]): string[];
