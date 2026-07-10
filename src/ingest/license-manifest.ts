// Gate B — License (legal). FAIL CLOSED. The pure, testable core.
//
// A licensing violation is legally irreversible — you cannot "react" to having
// hosted copyrighted content for months. So every source is license-gated from
// its manifest entry BEFORE it is ever ingested/published. This module is the
// validator; `check-licenses.ts` is the runnable gate around it.
//
// The manifest (`ingest/sources.config.json`) is the pre-publish source of
// truth: the per-work license map reviewed by the owner. Any entry that is not
// unambiguously in the allowed set, or is missing provenance, fails closed.

export const ALLOWED_LICENSES = ['Public Domain', 'CC BY', 'CC BY-SA'] as const;
export type AllowedLicense = (typeof ALLOWED_LICENSES)[number];

export function isAllowedLicense(license: unknown): license is AllowedLicense {
  return typeof license === 'string' && (ALLOWED_LICENSES as readonly string[]).includes(license);
}

// ToS-protected aggregators we must never scrape/host (ADR-008, CLAUDE.md). The
// TEXT may be public domain, but reusing THEIR compilation is a breach-of-contract
// exposure (the hiQ pattern). A source whose provenance points here fails closed:
// it must be re-sourced from a permitted PD source, or explicitly quarantined.
export const FORBIDDEN_PROVENANCE_DOMAINS = ['biblehub.com', 'studylight.org'] as const;

function provenanceHost(url: string): string | null {
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Returns the forbidden aggregator domain a provenance URL belongs to, else null.
// Matches the domain and any subdomain (www.biblehub.com), not naive substrings.
export function forbiddenProvenanceDomain(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  const host = provenanceHost(url.trim());
  if (host === null) return null;
  for (const d of FORBIDDEN_PROVENANCE_DOMAINS) {
    if (host === d || host.endsWith(`.${d}`)) return d;
  }
  return null;
}

// Provenance is the attribution + license basis for a work. `year` and
// `edition` guard the "edition trap": a public-domain author with a post-1929
// *translation* is NOT public domain, so the specific edition + year must be
// recorded and reviewable (see ACQUISITION_MANIFEST.md §4).
export interface SourceProvenance {
  url: string;
  edition: string;
  year: number | string;
}

export interface SourceManifestEntry {
  id: string;
  title: string;
  author: string;
  license: string;
  provenance: SourceProvenance;
  // Set to a non-empty reason to knowingly HOLD a source out of publish (e.g. it
  // is sourced from a forbidden aggregator and awaits re-sourcing). A quarantined
  // entry is declared/registered but must never be published or retrieved.
  quarantine?: string;
}

export interface LicenseViolation {
  id: string;
  reason: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateProvenance(id: string, prov: unknown): LicenseViolation[] {
  const out: LicenseViolation[] = [];
  if (typeof prov !== 'object' || prov === null) {
    out.push({ id, reason: 'missing provenance object (need url, edition, year)' });
    return out;
  }
  const p = prov as Record<string, unknown>;
  if (!isNonEmptyString(p.url)) out.push({ id, reason: 'provenance.url is missing/empty' });
  if (!isNonEmptyString(p.edition)) out.push({ id, reason: 'provenance.edition (translator/edition) is missing/empty' });
  if (p.year === undefined || p.year === null || p.year === '') {
    out.push({ id, reason: 'provenance.year is missing (edition-trap guard)' });
  }
  return out;
}

// Validate a parsed manifest. Returns every violation found (fail loud on all,
// not just the first). An empty array means the manifest is clean and every
// listed source may be published.
export function validateManifest(manifest: unknown): LicenseViolation[] {
  if (!Array.isArray(manifest)) {
    return [{ id: '(root)', reason: 'manifest must be a JSON array of source entries' }];
  }

  const out: LicenseViolation[] = [];
  const seen = new Set<string>();

  manifest.forEach((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      out.push({ id: `[${i}]`, reason: 'entry is not an object' });
      return;
    }
    const e = raw as Record<string, unknown>;
    const id = isNonEmptyString(e.id) ? e.id : `[${i}]`;

    if (!isNonEmptyString(e.id)) out.push({ id, reason: 'id is missing/empty' });
    else if (seen.has(e.id)) out.push({ id, reason: 'duplicate id' });
    else seen.add(e.id);

    if (!isNonEmptyString(e.title)) out.push({ id, reason: 'title is missing/empty' });
    if (!isNonEmptyString(e.author)) out.push({ id, reason: 'author is missing/empty' });

    // The core legal check: license must be present AND in the allowed set.
    if (e.license === undefined || e.license === null || e.license === '') {
      out.push({ id, reason: 'license is missing/empty (fail closed → quarantine)' });
    } else if (!isAllowedLicense(e.license)) {
      out.push({ id, reason: `license "${String(e.license)}" is not in the allowed set (${ALLOWED_LICENSES.join(' | ')})` });
    }

    out.push(...validateProvenance(id, e.provenance));

    // Fail closed on forbidden-aggregator provenance (ADR-008). A source sourced
    // from biblehub/studylight may not be published — unless it is explicitly
    // quarantined (declared + held for re-sourcing, never published).
    const provUrl = (typeof e.provenance === 'object' && e.provenance !== null)
      ? (e.provenance as Record<string, unknown>).url
      : undefined;
    const forbidden = forbiddenProvenanceDomain(provUrl);
    if (forbidden !== null && !isNonEmptyString(e.quarantine)) {
      out.push({ id, reason: `provenance host is a forbidden aggregator (${forbidden}) — ADR-008; re-source from a permitted PD source (SWORD/Wikisource/archive.org/STEP), or set "quarantine" to hold it (never published)` });
    }
  });

  return out;
}
