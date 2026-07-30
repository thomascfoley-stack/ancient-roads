// Excerpt sample policy — ONE reader for forbidden-provenance domains (license-manifest.ts)
// and manifest flags (sources.config.json). The header string is derived from the same
// filter result as the sample; nothing certifies what this function did not check.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forbiddenProvenanceDomain } from '../../src/ingest/license-manifest.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

export function loadManifestById(manifestPath = path.join(ROOT, 'ingest/sources.config.json')): Map<string, ManifestEntry> {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestEntry[];
  return new Map(raw.map((e) => [e.id, e]));
}

/** Single eligibility predicate — used for both sample selection and the log header. */
export function excerptEligibility(
  source: PublishedSourceRow,
  manifestEntry: ManifestEntry | undefined,
  forbiddenSectionRowCount: number,
): ExcerptEligibility {
  const base = { slug: source.slug, source_type: source.source_type, eligible: false, reason: '' };
  if (source.status !== 'published') return { ...base, reason: 'not published' };
  if (!manifestEntry) return { ...base, reason: 'no manifest entry — cannot certify' };
  if (manifestEntry.quarantine?.trim()) return { ...base, reason: 'manifest quarantine' };
  const fp = manifestEntry.backfill?.forbidden_provenance;
  if (fp === 'skip') return { ...base, reason: 'manifest forbidden_provenance=skip' };
  const manifestDomain = forbiddenProvenanceDomain(manifestEntry.provenance?.url);
  if (manifestDomain) return { ...base, reason: `manifest provenance domain ${manifestDomain}` };
  const sourceDomain = forbiddenProvenanceDomain(source.provenance?.url);
  if (sourceDomain) return { ...base, reason: `source provenance domain ${sourceDomain}` };
  if (forbiddenSectionRowCount > 0) {
    return { ...base, reason: `${forbiddenSectionRowCount} section row(s) with forbidden source_url` };
  }
  if (fp === 'exclude') {
    return {
      ...base,
      eligible: true,
      reason: 'manifest forbidden_provenance=exclude; no forbidden section source_url (body not inspected)',
    };
  }
  return {
    ...base,
    eligible: true,
    reason: 'manifest-eligible; no forbidden section source_url (body not inspected)',
  };
}

export function pickExcerptSlugs(rows: ExcerptEligibility[], limit = 3): string[] {
  const byRegister = new Map<string, string>();
  for (const r of rows.filter((x) => x.eligible)) {
    if (!byRegister.has(r.source_type)) byRegister.set(r.source_type, r.slug);
  }
  return [...byRegister.values()].slice(0, limit);
}

export function countForbiddenSectionRows(
  sectionRows: Array<{ slug: string; source_url: string | null }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of sectionRows) {
    if (forbiddenProvenanceDomain(r.source_url)) {
      counts.set(r.slug, (counts.get(r.slug) ?? 0) + 1);
    }
  }
  return counts;
}

export function buildExcerptReport(
  sources: PublishedSourceRow[],
  sectionRows: Array<{ slug: string; source_url: string | null }>,
  manifest: Map<string, ManifestEntry>,
) {
  const forbiddenSectionCounts = countForbiddenSectionRows(sectionRows);
  const eligibility = sources.map((s) =>
    excerptEligibility(s, manifest.get(s.slug), forbiddenSectionCounts.get(s.slug) ?? 0),
  );
  const sampleSlugs = pickExcerptSlugs(eligibility);
  const eligibleCount = eligibility.filter((e) => e.eligible).length;
  const header =
    sampleSlugs.length > 0
      ? `excerpt sample: ${sampleSlugs.length} manifest-eligible published work(s) of ${eligibleCount} eligible (${sources.length} published total) — quarantine/skip/forbidden-domain/forbidden section source_url excluded; section body not inspected`
      : `excerpt sample: none — ${sources.length} published work(s) checked; none manifest-eligible (body not inspected)`;
  return { eligibility, sampleSlugs, header, eligibleCount };
}

/** Format one excerpt row — identical bytes for terminal and committed log. */
export function formatExcerptLine(u: { unit_ordinal: number; ordinal: number; heading: string | null }) {
  return `u${u.unit_ordinal}.${u.ordinal}\t${u.heading ?? ''}`;
}

// CLI: --self-test red-proofs OR read JSON stdin for --select
if (process.argv.includes('--self-test')) {
  const manifest = loadManifestById();
  const skip = excerptEligibility(
    { slug: 'barnes-crosswire-nt', source_type: 'commentary', status: 'published' },
    manifest.get('barnes-crosswire-nt'),
    0,
  );
  if (skip.eligible) throw new Error('expected skip manifest to be ineligible');

  const laundered = excerptEligibility(
    { slug: 'wesley-crosswire', source_type: 'commentary', status: 'published', provenance: { url: 'https://crosswire.org/x' } },
    manifest.get('wesley-crosswire'),
    2,
  );
  if (laundered.eligible) throw new Error('expected forbidden section rows to exclude work');

  const report = buildExcerptReport(
    [{ slug: 'john-gill', source_type: 'commentary', status: 'published', provenance: { url: 'https://helloao.org/x' } }],
    [],
    manifest,
  );
  if (/clean-provenance works only/i.test(report.header)) throw new Error('header must not falsely certify cleanliness');
  if (!report.header.includes('body not inspected')) throw new Error('header must state body not inspected');

  const line = formatExcerptLine({ unit_ordinal: 1, ordinal: 1, heading: 'x'.repeat(90) });
  if (line.length <= 60) throw new Error('formatExcerptLine must not truncate asymmetrically');

  console.log('excerpt-sample-policy self-test: OK');
  process.exit(0);
}

if (process.argv.includes('--select')) {
  const input = JSON.parse(readFileSync(0, 'utf8')) as {
    sources: PublishedSourceRow[];
    sectionRows: Array<{ slug: string; source_url: string | null }>;
  };
  const manifest = loadManifestById();
  const report = buildExcerptReport(input.sources, input.sectionRows, manifest);
  console.log(JSON.stringify(report));
}
