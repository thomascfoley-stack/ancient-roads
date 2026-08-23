# W-HISTBACKLOG — Historians backlog remainder (DB-writer lane, position 2)

Branch: `swarm/w-histbacklog-historians` (worktree `/tmp/swarm-histbacklog`, base `9dce273` =
origin/main at fetch). Scope: DEV ONLY (`ep-tiny-hat`). No prod touches. Lane position 2, run
after W-EUSEBIUS completed (2026-08-23); sole DB writer during execution.

## Transitions

- CLAIMED 2026-08-23 (lane position 2, after W-EUSEBIUS handed off).
- DONE 2026-08-23 — remainder enumerated from live dev DB × manifest (set difference, not
  prose); **zero works required ingest**; the one absent work is parked with reason below.
  No DB writes were needed, so no red/green fix arc applies (no code changed, no rows
  written); the evidence is the enumeration transcript and the Foxe re-probe.
- AUDIT-GREEN — see "Verification" (one pre-existing baseline red, same as W-EUSEBIUS found;
  zero reds attributable to this branch — the branch is docs/evidence-only).
- VERIFIED / MERGED — for the Wave 7 verifier / Wave 8 orchestrator.

## Remainder enumeration (live dev DB × manifest, 2026-08-23)

History-lane universe = manifest `source_type='historian'` (29 works) + manifest
`genre='history'` fathers (3: schaff-npnf201/202/203). Set difference against dev `sources`
(+ sections/section_embeddings/history_embeddings parity counts):

- **31 of 32 present on dev with parity** (sections == section_embeddings ==
  history_embeddings per work; 0 null vectors): josephus-whiston (published) + 27 historians
  staged by the 2026-08-21 phase-2 run + schaff-npnf201/202/203 staged by W-EUSEBIUS
  (2026-08-23, carrying `provenance.genre='history'`).
- **1 absent: `foxe-martyrs`** — the entire remainder.
- `josephus-works` is NOT in the manifest (duplicate of josephus-whiston, removed 2026-08-20
  per ADR-110 containment, `docs/evidence/historian-phase2/josephus-works-adjudication.md`) —
  not part of the remainder.
- The brief's prose hint ("38 unbuilt at 08-18, 27 shipped 08-21") reconciles: the 08-18
  census counted 41 declarations; retypes/removals (gibbon declined, schaff-history
  self-duplicate, bennett retyped, josephus-works duplicate) reduced the lane to 29 historian
  entries + 3 genre fathers; 27 historians shipped 08-21; W-EUSEBIUS landed the 3 genre
  fathers 08-23; Foxe was already parked. Live counts, not prose, are the basis above.

Transcript: `docs/evidence/swarm-2026-08-22/w-histbacklog/remainder-enumeration.txt`.

## Per-work outcome

**`foxe-martyrs` — PARKED (basis missing/unverifiable), candidate-table entry for the owner
packet.** The manifest entry is a 1:1 mapping on paper (single slug, declared source
`provenance.acquire.adapter=ccel`, `ccel_ids=['foxe/martyrs']`, existing ccel adapter), but
the basis fails: CCEL serves HTML, not ThML, at that id — re-probed live 2026-08-23
(`foxe-ccel-probe.txt`): `GET /ccel/foxe/martyrs.xml` → HTTP 200 `text/html` (the adapter's
ThML guard fails closed, "Nothing written"); the CCEL author page lists only this same id, so
no alternate ThML-bearing edition exists under `foxe`. Same refusal the 2026-08-21 phase-2
run logged. Remedies are owner-level choices, never an invented one: (a) supply a different
ThML-bearing catalog id/edition (new provenance), or (b) authorize a small HTML adapter (new
code — fails the brief's "existing adapter" precondition). Edition-year capture is also still
open per the manifest's own provenance note. Nothing written anywhere.

No other work required action: every other lane work is already staged/published on dev with
parity (counts in the transcript), so "unambiguous works staged with parity" is satisfied by
pre-existing state, re-verified live.

## Eusebius-branch commits dependency

**Not needed for this item's execution, and not ported.** Nothing was ingested, so neither
the genre-carriage commit (`f6f1275`) nor the SCOPE widening was required at run time. The
genre datum those commits persist is ALREADY in the dev DB (npnf201/202/203 carry
`provenance.genre='history'` — verified in the enumeration transcript), written by
W-EUSEBIUS's own run. Merge sequencing note for the orchestrator: the dev DB rows now depend
on `f6f1275`'s mechanism having run; if prod ever re-ingests those works before the
eusebius branch merges, the genre datum would be lost — sequence W-EUSEBIUS's merge before
any prod replay of the npnf arc (owner packet, W-EUSEBIUS Phase 4).

## Verification

- Parity instrument (the brief's named check, W-EUSEBIUS's parity rules): live per-work
  counts sections == section_embeddings == history_embeddings for all 31 present lane works;
  0 null vectors; transcript committed.
- Register-wall guard: staged works are unreachable by the shipped SCOPE (status clause) —
  no `history-scope-db` test exists on this base (it rides the eusebius branch); the
  status-based check is in the transcript (`status` column: 27 staged + 1 published +
  3 staged npnf).
- `npm run audit` (worktree, 2026-08-23): see `audit.txt` — 847/848 tests; the ONE red is
  the same pre-existing baseline defect W-EUSEBIUS filed
  (`test/publish-flip-toolchain.test.ts` thayers evidence gate, red at base `9dce273`,
  inputs untouched by this docs-only branch). Zero reds attributable to this branch.

## Spend accounting (amendment A1)

- Embeddings API: **0 embeds** (nothing ingested, nothing re-embedded). LLM calls: **0**.
- External network: 3 read-only CCEL GETs (the Foxe probe). DB: read-only queries; **0 rows
  written**. **Total provider spend: $0.00.**

## Owner-packet candidate-table row (§11)

| Item | What is ready | Exact command to run | Rollback | Evidence |
|---|---|---|---|---|
| foxe-martyrs (parked) | Parked reason + live re-probe; no ingest possible with the existing ccel adapter | Owner ruling needed FIRST: (a) new ThML-bearing CCEL id/edition, or (b) authorize an HTML adapter; then `npx tsx src/ingest/ccel-to-historian-jsonl.ts --slug=foxe-martyrs` → `ingest-historian.ts` → `historian-digest.mjs` (dev, staged) per the 08-21 phase-2 pattern | Nothing written — no rollback needed | `docs/evidence/swarm-2026-08-22/w-histbacklog/foxe-ccel-probe.txt`; `docs/evidence/historian-phase2/foxe-martyrs.log` |

## Files / evidence

`docs/evidence/swarm-2026-08-22/w-histbacklog/` (`remainder-enumeration.txt`,
`foxe-ccel-probe.txt`, `audit.txt`). No code changes; no migrations; no STATUS.md (A3:
per-item file only).
