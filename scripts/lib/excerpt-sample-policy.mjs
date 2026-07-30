// Excerpt sample policy — ONE reader for forbidden-provenance domains and manifest flags
// (ingest/sources.config.json). The header string is derived from the same filter result
// as the sample; nothing certifies what this function did not check.
//
// WHY .mjs (Work Order v2 Tranche 0.1): this module is on the production instrument's
// path. It used to be .mts and the CLI reached it by shelling out to `npx tsx`, which
// (a) put a transpiler between production and its legal filter, (b) could fetch a package
// from the network mid-run, and (c) forced the CLI to keep its own copy of the line
// formatter because it could not import across that boundary. All three are gone: the
// forbidden-domain predicate is imported from src/ingest/forbidden-provenance.mjs, which
// license-manifest.ts also re-exports, so there is still exactly one body of that logic.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forbiddenProvenanceDomain } from '../../src/ingest/forbidden-provenance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadManifestById(manifestPath = path.join(ROOT, 'ingest/sources.config.json')) {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return new Map(raw.map((e) => [e.id, e]));
}

/** Single eligibility predicate — used for both sample selection and the log header. */
export function excerptEligibility(source, manifestEntry, forbiddenSectionRowCount) {
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

export function pickExcerptSlugs(rows, limit = 3) {
  const byRegister = new Map();
  for (const r of rows.filter((x) => x.eligible)) {
    if (!byRegister.has(r.source_type)) byRegister.set(r.source_type, r.slug);
  }
  return [...byRegister.values()].slice(0, limit);
}

export function countForbiddenSectionRows(sectionRows) {
  const counts = new Map();
  for (const r of sectionRows) {
    if (forbiddenProvenanceDomain(r.source_url)) {
      counts.set(r.slug, (counts.get(r.slug) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * @param sectionScan {{ rows: Array<{slug: string, source_url: string|null}>, truncated: boolean }}
 *   The caller MUST say whether its section-row query hit its own LIMIT. A truncated scan
 *   cannot show that a work has no forbidden source_url — it can only show that none was
 *   found in the rows that happened to come back — so a truncated scan makes EVERY work
 *   ineligible rather than silently certifying on a partial read.
 */
export function buildExcerptReport(sources, sectionScan, manifest) {
  if (!sectionScan || typeof sectionScan.truncated !== 'boolean' || !Array.isArray(sectionScan.rows)) {
    throw new Error('buildExcerptReport: sectionScan must be { rows: [], truncated: boolean } — a caller that will not say whether it read every row cannot be certified');
  }
  const forbiddenSectionCounts = countForbiddenSectionRows(sectionScan.rows);
  const eligibility = sources.map((s) => {
    const verdict = excerptEligibility(s, manifest.get(s.slug), forbiddenSectionCounts.get(s.slug) ?? 0);
    if (sectionScan.truncated) {
      return { ...verdict, eligible: false, reason: `section source_url scan truncated at its LIMIT — cannot certify (was: ${verdict.reason})` };
    }
    return verdict;
  });
  const sampleSlugs = pickExcerptSlugs(eligibility);
  const eligibleCount = eligibility.filter((e) => e.eligible).length;
  const truncNote = sectionScan.truncated ? ' — SECTION SCAN TRUNCATED, nothing certified' : '';
  const header =
    sampleSlugs.length > 0
      ? `excerpt sample: ${sampleSlugs.length} manifest-eligible published work(s) of ${eligibleCount} eligible (${sources.length} published total) — quarantine/skip/forbidden-domain/forbidden section source_url excluded; section body not inspected`
      : `excerpt sample: none — ${sources.length} published work(s) checked; none manifest-eligible (body not inspected)${truncNote}`;
  return { eligibility, sampleSlugs, header, eligibleCount, scanTruncated: sectionScan.truncated };
}

/** Format one excerpt row — identical bytes for terminal and committed log. */
export function formatExcerptLine(u) {
  return `u${u.unit_ordinal}.${u.ordinal}\t${u.heading ?? ''}`;
}

/**
 * The ONLY way an excerpt row becomes text. The CLI's terminal output and its committed
 * --out log both go through here, so the two cannot drift: change formatExcerptLine and
 * both move together (Work Order v2 Tranche 0.2).
 */
export function renderExcerptLines(rows) {
  return rows.map((u) => formatExcerptLine(u));
}
