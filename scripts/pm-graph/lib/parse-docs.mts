// Pure parsers that turn this repo's PM/docs corpus into graph nodes and edges.
//
// Every extracted ID set here is DERIVED from the document that owns it — gate IDs come
// from MASTER.md's own lane tables, ADR IDs from DECISIONS.md's own headers — never
// hand-typed. MASTER.md's own failure-mode watchlist names "a hand-maintained expected set
// that nothing enforces" as the single most repeated defect class in this repo; a graph tool
// that hand-typed its own gate list would just be watchlist instance N+1 wearing a database.
//
// Nothing here touches the filesystem or a network. ingest.mts does IO; this file is pure
// functions over strings, so it is testable without Docker, Neo4j, or a checkout on disk.

export interface DocGate {
  id: string;
  lane: string;
  title: string;
  ownerGoRequired: boolean;
  statusRaw: string;
  sourceDoc: string;
}

export interface DocAdr {
  id: string;
  title: string;
  sourceDoc: string;
}

export interface WorklogEntry {
  /** Stable id: `${date}#${indexWithinDate}` — WORKLOG.md has multiple same-day entries. */
  entryId: string;
  date: string;
  qualifier: string | null;
  title: string;
  body: string;
  sourceDoc: string;
}

export interface ExtractedLink {
  linkText: string;
  rawTarget: string;
  /** Repo-relative path, only when it resolves against knownPaths. Null for external/broken/anchor-only links. */
  resolvedPath: string | null;
  anchor: string | null;
  isExternal: boolean;
  /** True for a same-repo relative link that did NOT resolve to any file in knownPaths. */
  broken: boolean;
}

export interface MentionMatch {
  id: string;
  kind: 'gate' | 'adr';
}

export interface CorrectionMatch {
  marker: string;
  snippet: string;
  gateRefs: string[];
  adrRefs: string[];
  linkRefs: string[];
}

const stripHtmlTags = (s: string): string => s.replace(/<[^>]+>/g, '');

/** Splits a markdown table row into trimmed cells. Assumes no literal unescaped `|` inside a cell. */
export function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

/**
 * Derives Gate nodes from MASTER.md's own `## Lane X` sections and their `| # | Gate | Status |`
 * tables. Deliberately requires the exact header cells (not "any table in a lane section") so
 * sub-tables like A1's own blocker table (`| # | Blocker | Verdict § |`) are not mistaken for
 * gate rows.
 */
export function extractGates(masterMdText: string, sourceDoc: string): DocGate[] {
  const lines = masterMdText.split('\n');
  const gates: DocGate[] = [];
  let currentLane: string | null = null;
  let inGateTable = false;

  for (const line of lines) {
    const laneMatch = line.match(/^## Lane\s+(\S+)/);
    if (laneMatch) {
      currentLane = laneMatch[1] ?? null;
      inGateTable = false;
      continue;
    }
    if (currentLane === null) continue;

    if (/^\|\s*#\s*\|\s*Gate\s*\|\s*Status\s*\|\s*$/.test(line.trim())) {
      inGateTable = true;
      continue;
    }

    if (!inGateTable) continue;
    const t = line.trim();
    if (!t.startsWith('|')) {
      inGateTable = false;
      continue;
    }
    if (/^\|\s*-+\s*\|/.test(t)) continue; // header separator row

    const cells = splitTableRow(line);
    if (cells.length < 3) continue;
    const idCell = stripHtmlTags(cells[0] ?? '').trim();
    const idTok = idCell.match(/^([A-Za-z]\d+[a-z]?)/);
    if (!idTok || !idTok[1]) continue;

    let title = (cells[1] ?? '').trim();
    const ownerGoRequired = title.startsWith('⚑');
    if (ownerGoRequired) title = title.replace(/^⚑\s*/, '');

    const statusRaw = cells.slice(2).join('|').trim();
    gates.push({ id: idTok[1], lane: currentLane, title, ownerGoRequired, statusRaw, sourceDoc });
  }
  return gates;
}

/** Derives ADR nodes from DECISIONS.md's own `## ADR-NNN — Title` headers. */
export function extractAdrs(decisionsMdText: string, sourceDoc: string): DocAdr[] {
  const adrs: DocAdr[] = [];
  const re = /^## (ADR-\d{3}) — (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(decisionsMdText)) !== null) {
    const id = m[1];
    const title = m[2];
    if (id && title) adrs.push({ id, title: title.trim(), sourceDoc });
  }
  return adrs;
}

/** Derives WorklogEntry nodes from WORKLOG.md's own `## YYYY-MM-DD (qualifier) — Title` headers. */
export function extractWorklogEntries(worklogText: string, sourceDoc: string): WorklogEntry[] {
  const headerRe = /^## (\d{4}-\d{2}-\d{2})(?: \(([^)]+)\))? — (.+)$/gm;
  const headers: { index: number; date: string; qualifier: string | null; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(worklogText)) !== null) {
    const date = m[1];
    const title = m[3];
    if (!date || !title) continue;
    headers.push({ index: m.index, date, qualifier: m[2] ?? null, title: title.trim() });
  }

  const dateCounts = new Map<string, number>();
  const entries: WorklogEntry[] = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (!h) continue;
    const bodyStart = worklogText.indexOf('\n', h.index) + 1;
    const bodyEnd = i + 1 < headers.length ? (headers[i + 1]?.index ?? worklogText.length) : worklogText.length;
    const body = worklogText.slice(bodyStart, bodyEnd).trim();
    const n = (dateCounts.get(h.date) ?? 0) + 1;
    dateCounts.set(h.date, n);
    entries.push({
      entryId: `${h.date}#${n}`,
      date: h.date,
      qualifier: h.qualifier,
      title: h.title,
      body,
      sourceDoc,
    });
  }
  return entries;
}

/**
 * Extracts markdown `[text](target)` links from a chunk of text that was found at `sourceDocPath`,
 * resolving relative targets against that path and checking membership in `knownPaths` (repo-relative,
 * forward-slash paths — pass the actual tracked file set, not a live fs.existsSync check, so results
 * stay deterministic and testable without a checkout).
 */
export function extractLinks(text: string, sourceDocPath: string, knownPaths: Set<string>): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const re = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const linkText = m[1] ?? '';
    const rawTarget = (m[2] ?? '').trim();
    if (/^https?:\/\//.test(rawTarget)) {
      links.push({ linkText, rawTarget, resolvedPath: null, anchor: null, isExternal: true, broken: false });
      continue;
    }
    if (/^mailto:/.test(rawTarget)) continue;

    const [pathPart = '', anchor = null] = rawTarget.split('#');
    let resolvedPath: string;
    if (pathPart === '') {
      resolvedPath = sourceDocPath; // same-document anchor
    } else {
      const dir = sourceDocPath.includes('/') ? sourceDocPath.slice(0, sourceDocPath.lastIndexOf('/')) : '.';
      resolvedPath = posixNormalize(`${dir}/${pathPart}`);
    }
    const exists = pathPart === '' || knownPaths.has(resolvedPath);
    links.push({
      linkText,
      rawTarget,
      resolvedPath: exists ? resolvedPath : null,
      anchor,
      isExternal: false,
      broken: !exists,
    });
  }
  return links;
}

/** Minimal POSIX path normalizer (resolves `..`/`.` segments) — no node:path dependency, so this stays pure. */
function posixNormalize(p: string): string {
  const parts = p.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/**
 * Finds mentions of known gate/ADR IDs in free text. `knownIds` must be DERIVED (from
 * extractGates/extractAdrs), never hand-typed — that allowlist is what stops this from matching
 * incidental alnum tokens (git shas, "e3b14cd", never match: see module tests).
 */
export function extractMentions(
  text: string,
  knownGateIds: ReadonlySet<string>,
  knownAdrIds: ReadonlySet<string>,
): MentionMatch[] {
  const mentions: MentionMatch[] = [];
  const gateRe = /\b([A-Za-z]\d+[a-z]?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = gateRe.exec(text)) !== null) {
    const tok = m[1];
    if (tok && knownGateIds.has(tok)) mentions.push({ id: tok, kind: 'gate' });
  }
  const adrRe = /\bADR-(\d{3})\b/g;
  while ((m = adrRe.exec(text)) !== null) {
    const id = `ADR-${m[1]}`;
    if (knownAdrIds.has(id)) mentions.push({ id, kind: 'adr' });
  }
  return mentions;
}

/**
 * Best-effort CORRECTS signal: a fixed keyword list co-occurring with a reference in the same
 * chunk of text. This is a heuristic, not a proof — every match carries its snippet so a reader
 * (human or agent) can judge it rather than trust it blindly. Extend CORRECTION_MARKERS as new
 * phrasing shows up; do not treat an empty result as "nothing was corrected here."
 */
export const CORRECTION_MARKERS = [
  'CORRECTED',
  'RETRACTED',
  'WITHDRAWN',
  'SUPERSEDED',
  'SUPERSEDE',
  'REVERSED',
  'false when written',
  'went stale',
] as const;

export function extractCorrections(
  text: string,
  gateMentions: MentionMatch[],
  linkTargets: string[],
): CorrectionMatch[] {
  const gateRefs = gateMentions.filter((m) => m.kind === 'gate').map((m) => m.id);
  const adrRefs = gateMentions.filter((m) => m.kind === 'adr').map((m) => m.id);
  if (gateRefs.length === 0 && adrRefs.length === 0 && linkTargets.length === 0) return [];

  const out: CorrectionMatch[] = [];
  for (const marker of CORRECTION_MARKERS) {
    const idx = text.indexOf(marker);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + marker.length + 60);
    out.push({
      marker,
      snippet: text.slice(start, end).replace(/\s+/g, ' ').trim(),
      gateRefs: [...new Set(gateRefs)],
      adrRefs: [...new Set(adrRefs)],
      linkRefs: [...new Set(linkTargets)],
    });
  }
  return out;
}
