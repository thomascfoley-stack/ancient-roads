# W-STRONGS — Strong's truncated glosses (DB-writer lane, position 4)

Status: **MOOT-with-finding** (truncation is in the upstream source, not the adapter; per the
brief's own decision rule). Independent Wave-7 verifier owed.
Branch: `swarm/w-strongs-gloss-fix` (worktree `/tmp/swarm-strongs`, base `9dce273` = origin/main)
Scope: DEV ONLY. No prod anything, no DB writes (none were needed — see below).

## Transitions

- CLAIMED 2026-08-23 — lane position 4, after W-EUSEBIUS, W-HISTBACKLOG, W-THAYER completed.
- RED-PROVEN 2026-08-23 — the filed nit reproduced exactly as filed: served
  `web/public/lexicon/greek.json` G2316 `def` = `figuratively, a magistrate; by Hebraism, very`
  with the primary gloss stranded in `derivation`. Then measured against the raw source:
  **the split exists verbatim in the upstream bytes** (openscriptures js AND the 2007
  authoritative XML, cited line-for-line in the evidence README). Whole-corpus diff: all
  5,523 Greek + 8,674 Hebrew entries byte-identical to a fresh upstream fetch — the adapter
  is lossless. The check was watched RED (seeded truncation → exit 1, `mismatch keys: G2316`).
- MOOT-with-finding 2026-08-23 — brief: "If truncation is in the SOURCE, not the adapter,
  mark MOOT-with-finding and cite the source bytes." It is; bytes cited. No adapter change,
  no per-row patch.
- AUDIT-GREEN — `npm run audit` in the worktree: green EXCEPT the known baseline red
  (`test/publish-flip-toolchain.test.ts` thayers evidence gate) = W-BASEFIX's item, noted not
  fixed. (See evidence README for the audit's relationship to this item: this item changes no
  code at all — evidence files only.)
- VERIFIED / MERGED — owed to the Wave-7 verifier / Wave-8 orchestrator.

## What was checked (the brief's procedure, point by point)

1. **Entry found**: WORKLOG.md:1669 (2026-08-21 entry, "Strong's ingest data nit — truncated
   glosses, def/derivation field splits — G2316's 'figuratively'").
2. **Adapter found**: `src/ingest/ingest-strongs.ts` — fetches the two openscriptures js
   dictionaries and writes static `web/public/lexicon/{greek,hebrew}.json` (served to
   `/word/[strongs]`; `normalize()` applies `.trim()` only). The only other consumer of the
   upstream file (`src/ingest/adapter-archive.ts:217`) reads lemmas for OCR recognizability
   measurement — not glosses.
3. **Raw source**: not vendored under `data/raw/` (the adapter fetches from
   `github.com/openscriptures/strongs` at run time, per DATA_SOURCES.md:30-31). Fetched fresh
   for verification; sha256s recorded in the transcript.
4. **Root cause**: SOURCE, not adapter. Evidence:
   `docs/evidence/swarm-2026-08-22/w-strongs/README.md` (+ `verify-strongs-glosses.mjs`,
   `verify-transcript.txt`, `red-proof-transcript.txt`, `reingest-transcript.txt`,
   `dev-db-strongs-check.txt` in the same directory).
5. **"Re-run the Strong's ingest on dev (staged; the work's current dev status first — check
   sources)"**: checked first — `ingest/sources.config.json` has no strongs entry; dev DB
   (host-asserted `ep-tiny-hat`, read-only) has **0 sources matching `strong*`** and 16
   lexicon sources none of which is Strong's. Strong's is a static-asset ingest; there is no
   DB work to stage or re-ingest. The adapter was re-run in the worktree anyway:
   5,523 + 8,674 entries, output **byte-identical** to the served files (sha256-verified) —
   upstream has not drifted, pipeline reproducible.
6. **G2316 + 20-entry random sample vs raw source**: 20/20 byte-identical (seeded sample,
   seed 20260821, reproducible via the committed script); before/after for G2316 recorded in
   the evidence README (before = after = upstream bytes; no change possible).

## Parity / vectors / spend (A1)

- No DB rows exist for Strong's; nothing changed ⇒ parity invariant unaffected,
  section-vector-pairing suite not implicated, **0 embeddings re-embedded**.
- DeepInfra spend: **$0.00** (0 units). Network: two ~1 MB public GitHub fetches, no provider.

## Owner-packet note — prod replay

**None needed.** There is no Strong's data in any database (dev or prod) — the corpus is a
gitignored static asset deployed with the web bundle. The *finding* for the packet is a
decision, not a replay: on `/word/G2316` the primary gloss renders under "Derivation"
because upstream's 2007 XML tags it `<strongs_derivation>`; composing `derivation + def`
into the Definition block would restore the printed-Strong's reading, but `derivation` is
genuine etymology for most entries, so any composition rule is a display-semantics (UX/owner)
call — alternatively an upstream re-source. Not decided under an unsupervised order.

Cost of not fixing: `/word/*` keeps showing a minority of Strong's entries with the leading
gloss under the "Derivation" label (all information still displayed, mislabeled).

## Notes for the verifier

- Re-run: `node docs/evidence/swarm-2026-08-22/w-strongs/verify-strongs-glosses.mjs` from the
  worktree root (exit 0 = lossless; it fetched upstream live on 2026-08-23).
- This branch contains evidence + status files only; no code or data changed.
- The audit's single red (`publish-flip-toolchain` thayers evidence gate) predates this branch
  at origin/main and belongs to W-BASEFIX — do not read it as this item's.
