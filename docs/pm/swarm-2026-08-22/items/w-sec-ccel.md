# W-SEC-CCEL — hardcoded `(CCEL)` provenance in history citations

**Workstream:** swarm/W-T3-cursor-ccel-ux · **Base:** origin/main `9dce273`
**Status: AUDIT-GREEN** (awaiting Wave 7 independent verification)

Transitions: CLAIMED → RED-PROVEN → FIXED → AUDIT-GREEN

## The defect

WORKLOG 2026-08-21 deferred security finding: `(CCEL)` hardcoded provenance. Site:
`web/src/components/history-results.tsx` `cite()` appended ` (CCEL)` to EVERY clipboard
citation. Measured against the served corpus on dev: the one served history work,
`josephus-whiston`, is **CrossWire SWORD**, not CCEL — so the shipped citation was a false
attribution on the live surface, not a hypothetical (27 further CCEL works are staged, so the
tag was true for them only by luck).

The WORKLOG entry's intent ("derive from the source record") was unambiguous, so this was
fixed rather than HELD-FOR-OWNER. The derived label is the provenance **hostname**
(`ccel.org`, `crosswire.org`) — the design's own citation format named the host (`(CCEL)`);
only the hardcoding was the defect. Note for the owner packet: the displayed string changes
from the brand `CCEL` to the record-derived `ccel.org`.

## Fix

- `web/src/lib/history-search-db.ts` — `ROW_COLS` selects `src.provenance ->> 'url'`; the
  `WorkRef` gains `provenanceHost`, derived via the shared `provenanceHost` parser.
- `web/src/lib/forbidden-provenance.mjs` + `src/ingest/forbidden-provenance.mjs` — the existing
  `provenanceHost` parser is now EXPORTED (the file's own rule: never re-typed). Both copies
  changed byte-identically (the sync guard, test/web-core-sync.test.ts).
- `web/src/components/history-results.tsx` — the citation uses the work's own `provenanceHost`;
  when a record has no parseable URL the parenthetical is omitted, never fabricated.
- `docs/HISTORY_RETRIEVAL_DESIGN.md` §5 — the design line documenting the hardcoded format
  updated (§2.5 comment sweep).

## Tests

`web/test/invariants/history-results.test.tsx` — new case: the copied citation carries the
work's OWN provenance host. The fixture is `josephus-whiston`/`crosswire.org` — the real
false-attribution pair.

## Evidence (docs/evidence/swarm-2026-08-22/w-sec-ccel/)

- `red-hardcoded-ccel.log` — watched RED: citation reads `(CCEL)` for the CrossWire work.
- `green-derived-provenance.log` — suite green after the fix (6/6).
- `redproof-seeded.log` — red-proof: hardcoded ` (CCEL)` seeded back → RED. Seed reverted.
- `derived-hosts-dev.log` — dev read: every served history work's `provenance->>'url'` derives
  a host through the shipped parser (`josephus-whiston → crosswire.org`).

## Spend (A1)

$0 — no provider calls (DB reads only, dev `ep-tiny-hat`).
