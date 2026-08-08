// The run digest of INGESTION_LOOP.md §2/§8 — the batched unit of owner review.
//
// The loop runs fully autonomous to `staged` (reversible) and batches the one
// irreversible thing — publish — for the owner AS A DIGEST. Every state
// transition lands in the run-log; the digest is what the owner clears.
// Claim discipline (§8): it reports per-work n, never "corpus ingested ✓".

export interface DigestRow {
  slug: string;
  adapter: string;
  sourceType: string;
  result: 'published' | 'staged' | 'skipped' | 'quarantined' | 'escalated';
  units?: number;
  anchored?: number;
  embedded?: number;
  code?: string;
  reason?: string;
}

export interface DigestMeta {
  startedAt: string;
  endedAt: string;
  /** why the run ended: queue-empty, or the breaker's own reason string */
  outcome: 'queue-empty' | 'paused' | 'halted';
  outcomeReason?: string;
}

export interface Digest {
  meta: DigestMeta;
  counts: Record<DigestRow['result'], number>;
  staged: DigestRow[];
  escalations: DigestRow[];
  quarantined: DigestRow[];
}

export function buildDigest(rows: DigestRow[], meta: DigestMeta): Digest {
  const counts: Digest['counts'] = { published: 0, staged: 0, skipped: 0, quarantined: 0, escalated: 0 };
  for (const r of rows) counts[r.result]++;
  return {
    meta,
    counts,
    staged: rows.filter((r) => r.result === 'staged' || r.result === 'published'),
    escalations: rows.filter((r) => r.result === 'escalated'),
    quarantined: rows.filter((r) => r.result === 'quarantined'),
  };
}

function card(r: DigestRow): string {
  const nums = [
    r.units !== undefined ? `${r.units} units` : null,
    r.anchored !== undefined ? `${r.anchored} anchored` : null,
    r.embedded !== undefined ? `${r.embedded} embedded` : null,
  ].filter(Boolean).join(' · ');
  const why = [r.code, r.reason].filter(Boolean).join(' — ');
  return `- **${r.slug}** (${r.sourceType}, ${r.adapter})${nums ? ` — ${nums}` : ''}${why ? ` — ${why}` : ''}`;
}

export function digestMarkdown(d: Digest): string {
  const { meta, counts } = d;
  const lines: string[] = [
    `# Ingest run digest — ${meta.startedAt}`,
    '',
    `Outcome: **${meta.outcome}**${meta.outcomeReason ? ` — ${meta.outcomeReason}` : ''}`,
    `Window: ${meta.startedAt} → ${meta.endedAt}`,
    `Attempted works reaching a verdict: staged ${counts.staged} · published ${counts.published} · quarantined ${counts.quarantined} · escalated ${counts.escalated} · skipped ${counts.skipped}`,
    '',
    'The loop is the fixer; it does not certify itself. Every number below is a per-work measurement, not a corpus claim.',
    '',
    `## Publish digest — staged this run (${d.staged.length})`,
    '',
    ...(d.staged.length ? d.staged.map(card) : ['(none)']),
    '',
    `## Escalations — a human decides these (${d.escalations.length})`,
    '',
    ...(d.escalations.length ? d.escalations.map(card) : ['(none)']),
    '',
    `## Quarantined — known failure codes (${d.quarantined.length})`,
    '',
    ...(d.quarantined.length ? d.quarantined.map(card) : ['(none)']),
    '',
  ];
  return lines.join('\n');
}
