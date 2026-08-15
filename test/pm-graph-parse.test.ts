// Unit tests for scripts/pm-graph/lib/parse-docs.mts. Pure-function tests, no Docker/Neo4j
// needed — every assertion is a concrete extracted value, not toBeDefined/toBeTruthy, per this
// repo's false-confidence-audit standard: a test that can't fail proves nothing.
import { describe, expect, it } from 'vitest';
import {
  extractAdrs,
  extractCorrections,
  extractGates,
  extractLinks,
  extractMentions,
  extractWorklogEntries,
  splitTableRow,
} from '../scripts/pm-graph/lib/parse-docs.mts';

describe('splitTableRow', () => {
  it('splits a well-formed row into trimmed cells', () => {
    expect(splitTableRow('| A1 | Some title | Some **status** text |')).toEqual([
      'A1',
      'Some title',
      'Some **status** text',
    ]);
  });
});

describe('extractGates', () => {
  const fixture = `
## Lane A — gates

⚑ = owner go required, per occasion.

| # | Gate | Status |
|---|---|---|
| A1 | First gate | **CLOSED 2026-08-01.** Done. |
| A3 <a id="a3-rule"></a> | Anchor-tagged gate | **ADJUDICATED.** |
| A6 | ⚑ Deploy A | **DONE.** |

### A1 — the four Stage 2 blockers

| # | Blocker | Verdict § |
|---|---|---|
| B-1 | Not a gate row | should not be captured |

## Lane B — gates

| # | Gate | Status |
|---|---|---|
| B0 | Anchor recall | **CLEARED.** |
`;

  it('derives gate rows only from the # | Gate | Status table, per lane', () => {
    const gates = extractGates(fixture, 'docs/pm/MASTER.md');
    expect(gates.map((g) => g.id)).toEqual(['A1', 'A3', 'A6', 'B0']);
    expect(gates.map((g) => g.lane)).toEqual(['A', 'A', 'A', 'B']);
  });

  it('strips HTML anchor tags from the ID cell', () => {
    const gates = extractGates(fixture, 'docs/pm/MASTER.md');
    const a3 = gates.find((g) => g.id === 'A3');
    expect(a3?.title).toBe('Anchor-tagged gate');
  });

  it('does NOT pull rows from a differently-headed sub-table (the negative case)', () => {
    const gates = extractGates(fixture, 'docs/pm/MASTER.md');
    expect(gates.find((g) => g.id === ('B-1' as string))).toBeUndefined();
    expect(gates.map((g) => g.id)).not.toContain('B-1');
  });

  it('extracts the ⚑ owner-go marker as a boolean and strips it from the title', () => {
    const gates = extractGates(fixture, 'docs/pm/MASTER.md');
    const a6 = gates.find((g) => g.id === 'A6');
    expect(a6?.ownerGoRequired).toBe(true);
    expect(a6?.title).toBe('Deploy A');
    const a1 = gates.find((g) => g.id === 'A1');
    expect(a1?.ownerGoRequired).toBe(false);
  });
});

describe('extractAdrs', () => {
  it('derives ADR id and title from the header line', () => {
    const fixture = `## ADR-001 — Concordance, not commentator (architectural guarantee)\nbody text\n\n## ADR-102 — Confirm bge-large\nmore body\n`;
    const adrs = extractAdrs(fixture, 'docs/DECISIONS.md');
    expect(adrs).toEqual([
      { id: 'ADR-001', title: 'Concordance, not commentator (architectural guarantee)', sourceDoc: 'docs/DECISIONS.md' },
      { id: 'ADR-102', title: 'Confirm bge-large', sourceDoc: 'docs/DECISIONS.md' },
    ]);
  });
});

describe('extractWorklogEntries', () => {
  const fixture = `# WORKLOG

## 2026-08-15 (later) — Second entry today
Body of the second entry.
Spans two lines.

## 2026-08-15 (late) — First entry today
Body of the first entry.

## 2026-08-14 — Yesterday
Yesterday's body.
`;

  it('splits entries on the date header and captures date/qualifier/title', () => {
    const entries = extractWorklogEntries(fixture, 'WORKLOG.md');
    expect(entries.map((e) => e.entryId)).toEqual(['2026-08-15#1', '2026-08-15#2', '2026-08-14#1']);
    expect(entries[0]?.qualifier).toBe('later');
    expect(entries[2]?.qualifier).toBeNull();
    expect(entries[2]?.title).toBe('Yesterday');
  });

  it('bounds each body to its own section, not bleeding into the next entry', () => {
    const entries = extractWorklogEntries(fixture, 'WORKLOG.md');
    expect(entries[0]?.body).toContain('Spans two lines.');
    expect(entries[0]?.body).not.toContain('First entry today');
  });
});

describe('extractLinks', () => {
  const known = new Set(['docs/pm/MASTER.md', 'docs/pm/orders/2026-08-15-verdict.md']);

  it('resolves a relative link against the known path set', () => {
    const links = extractLinks('see [the verdict](orders/2026-08-15-verdict.md)', 'docs/pm/MASTER.md', known);
    expect(links).toEqual([
      {
        linkText: 'the verdict',
        rawTarget: 'orders/2026-08-15-verdict.md',
        resolvedPath: 'docs/pm/orders/2026-08-15-verdict.md',
        anchor: null,
        isExternal: false,
        broken: false,
      },
    ]);
  });

  it('marks a relative link that resolves to no tracked file as broken (does not silently drop it)', () => {
    const links = extractLinks('see [nope](orders/does-not-exist.md)', 'docs/pm/MASTER.md', known);
    expect(links[0]?.broken).toBe(true);
    expect(links[0]?.resolvedPath).toBeNull();
  });

  it('flags http(s) links as external without touching knownPaths', () => {
    const links = extractLinks('[gh](https://github.com/x/y/pull/92)', 'docs/pm/MASTER.md', known);
    expect(links[0]?.isExternal).toBe(true);
    expect(links[0]?.broken).toBe(false);
  });

  it('keeps an anchor fragment separate from the resolved path', () => {
    const links = extractLinks('[rule](#a3-rule)', 'docs/pm/MASTER.md', known);
    expect(links[0]?.anchor).toBe('a3-rule');
    expect(links[0]?.resolvedPath).toBe('docs/pm/MASTER.md');
  });
});

describe('extractMentions', () => {
  const gateIds = new Set(['A9', 'B5', 'D4']);
  const adrIds = new Set(['ADR-102']);

  it('matches only IDs present in the derived allowlist', () => {
    const m = extractMentions('Gate A9 blocks B5, per ADR-102.', gateIds, adrIds);
    expect(m).toEqual([
      { id: 'A9', kind: 'gate' },
      { id: 'B5', kind: 'gate' },
      { id: 'ADR-102', kind: 'adr' },
    ]);
  });

  it('does NOT match a decoy that fits the shape but is not in the allowlist (the false-positive check)', () => {
    // S1 has the right shape ([A-Za-z]\d+) but is a UX_REMEDIATION block id, not a MASTER.md gate.
    const m = extractMentions('S1 needs owner-supplied content.', gateIds, adrIds);
    expect(m).toEqual([]);
  });

  it('does NOT match a git-sha-shaped token (proves \\b bounds a whole alnum run, not a prefix)', () => {
    const m = extractMentions('deployed at e3b14cd and 16d9431 today', gateIds, adrIds);
    expect(m).toEqual([]);
  });
});

describe('extractCorrections', () => {
  it('flags a marker co-occurring with a reference, and returns the snippet', () => {
    const gateMentions = [{ id: 'D4', kind: 'gate' as const }];
    const text = 'This row read DEV-LOCAL DONE for the rest of that day; CORRECTED 2026-08-15 against gate D4.';
    const out = extractCorrections(text, gateMentions, []);
    expect(out).toHaveLength(1);
    expect(out[0]?.marker).toBe('CORRECTED');
    expect(out[0]?.gateRefs).toEqual(['D4']);
    expect(out[0]?.snippet).toContain('CORRECTED');
  });

  it('returns nothing when a marker word appears with no reference in the same chunk (no false claim)', () => {
    const out = extractCorrections('CORRECTED a typo, nothing else here.', [], []);
    expect(out).toEqual([]);
  });

  it('returns nothing when references exist but no marker keyword is present', () => {
    const gateMentions = [{ id: 'D4', kind: 'gate' as const }];
    const out = extractCorrections('Gate D4 is fine, no issue.', gateMentions, []);
    expect(out).toEqual([]);
  });
});
