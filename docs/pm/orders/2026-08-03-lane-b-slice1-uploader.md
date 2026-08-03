# ORDER — Lane B, Slice 1: the sermon uploader + the three searches + the tradition-gap join

**Issued** 2026-08-03 · **Lane B** (file-disjoint from Lane A, BUILD_MODEL §2) · gate **B5**
**Filed per bylaw 1.** This file IS the build prompt — paste it, or point a session at it.

---

## The task

Build Slice 1 of `docs/SERMON_SEARCH_DESIGN.md`: **one document type (prose/sermons) end to end.**

```
upload → parse → detect type → chunk → anchor → embed → store → status
                                    ↓
              verse-anchor scan · semantic · FTS · the tradition-gap join
```

The demo that closes the sale is #3 in the design's §1 loop: *"which voices from the tradition did I
not engage?"* Steps 1-2 are table-stakes personal search. **The join is the moat — if you build
only upload+search, you have built a filing cabinet.**

## Read first, and do not re-litigate

| Document | What it settles |
|---|---|
| `docs/SERMON_SEARCH_DESIGN.md` | The whole design, §1-§14. Architecture is DECIDED. |
| its §13 SLICE 0 RESULT | Anchor recall **90%** (CI lower bound 74% vs a 70% bar), precision at K=2. **The go/no-go already passed.** |
| `CLAUDE.md` + `AGENTS.md` | The standing rails. Definition of Done is strict and includes a browser check. |
| `docs/THE_LOOP.md` | Every check ships with its red-proof. A check never watched fail proves nothing. |
| `db/migrations/013_user_corpus.sql.draft` | **150 lines of schema already written** — four tables, RLS, Neon dialect. Start here, do not redesign. |

## Ground truth on the ground (measured 2026-08-03, not narrated)

- **Your database is `lane-b-uploader`** — Neon branch `br-fancy-block-ateczkh0`, endpoint
  `ep-snowy-bird-atmdsv3g`, parent `dev`. Gate B1 is CLOSED. It carries dev's full corpus
  (~700 works, 924k vectors) so the tradition-gap join has something real to join against, and
  it has migration 044 (`embeddings.served`) applied.
- **Vercel Pro is upgraded.** Gate B3 CLOSED — the design's §8 queue dependency is satisfied.
  Use the fire-and-forget drain kicked on upload; do not wait for cron.
- **Storage is not a constraint.** The owner has ruled: buy more if needed.
- **The UI lands at `/library/uploads`**, currently a five-line `ComingSoon` stub.

## ⚠ Migration numbering — read this before you write a single `.sql`

The repo hit migration-number collisions **twice in one night** on 2026-08-03: a concurrent
`/plans` session held 039-041, then took 042 *during* a rename into it. Numbers 039-045 are now
spoken for.

**Lane B takes the 100-block.** Your first migration is `100_user_corpus.sql` (promote the draft,
renumber it). Never take a number below 100. This is a hard rule, not a suggestion — a third
collision costs an evening.

## The five things that will silently ruin this if you get them wrong

**1. Model parity (§6) — the quiet one.** User chunks MUST be embedded by
`BAAI/bge-large-en-v1.5` via DeepInfra, the same model as the corpus. A different model makes the
tradition-gap join compare vectors from two different spaces and return **plausible garbage, with
no error, forever.** Every embedding row carries `model_slug`; a parity check refuses the join
when `model_slug` ≠ the corpus's. **Red-proof it:** seed one user row with a wrong `model_slug`
and watch the join refuse.

**2. The trust boundary (§7).** User content is **additive, never load-bearing.** A user's
paragraph and a Calvin quote must never look the same, and the user's words can **never** satisfy
the ≥2-traditions floor. The verifier already resolves `origin: 'corpus' | 'user_library'` — use
it. Slice 4 does the full `/ask` integration, but build the boundary in now rather than retrofit.

**3. Scanned PDFs must fail LOUD.** A PDF with no text layer indexed as an empty success is the
silent drop that destroys trust. Detect near-zero extractable text over N pages → status
`failed: needs OCR`. Never `indexed`. OCR itself is out of scope (§14).

**4. RLS on every user table, verified with two accounts.** `CLAUDE.md` is explicit: verify RLS by
running two accounts, not by reading the policy. The corpus tables are RLS-free and SELECT-only;
these are the opposite. Every row carries `user_id NOT NULL`, so the deploy gate's corpus scan
(`user_id IS NULL` + `public/` only) can never see them.

**5. Deletion is a real cascade.** `document → sections → embeddings → anchors → blob`. An orphan
embedding after a delete is a privacy bug, not a tidiness bug. Test the cascade.

## Scope

**IN:** prose/sermons only. Upload (MIME sniff, size + decompressed-size caps, checksum dedupe) ·
parse (docx/pdf/txt/md) · the prose chunker · anchoring (all three channels; the uncited-quote
shingle against `web/public/bible/` is the high-value one) · batched embedding off the request
path · the Postgres `FOR UPDATE SKIP LOCKED` queue · per-doc status with retry · the three
searches · **the tradition-gap join** · the `/library/uploads` UI replacing the stub.

**OUT:** type-aware chunking for papers/notes/books (Slice 2) · bulk-import UX (Slice 3) · the
full `/ask` integration (Slice 4) · OCR · anything in §14.

## ⚠ The tradition-gap join's corpus predicate — decide this before writing the join

Re-measured 2026-08-03 on `lane-b-uploader` (independently, via the owner URL): 832 sources
(35 published · 796 staged · 1 quarantined), 435,991 sections, **1,070,674 embeddings — of which
328,775 are `served=true` and 741,899 are not.** The "~700 works / 924k vectors" figure earlier in
this order was already stale; the number that matters isn't corpus size, it's this split.

**The join MUST filter on `embeddings.served = true`, never query `embeddings` unfiltered.**
A9 made `served` the switch for exactly this reason (see `web/src/lib/teacher/routing.ts`,
`LEGAL_CORPUS_FILTER`): the 796 staged sources have not cleared publish adjudication, and surfacing
them as "voices from the tradition you didn't cite" is a licensing surface, not a recall
trade-off. Use the same predicate the corpus retrieval path uses — do not hand-write a second one
(this repo's most-repeated defect class; see MASTER.md's failure-mode watchlist).

## Two owner decisions still open

- **B2 — confirm `bge-large` for user-corpus embedding.** ADR-005 already pins it for the corpus
  and §6's parity argument effectively forces it. **Proceed on bge-large**; if the owner rules
  otherwise the parity check is where it changes, one place.
- **B4 — the translation decision** (`docs/SLICE1_TRANSLATION_DECISION.md` recommends Option A +
  detection; it moved the headline 17 points). **This one genuinely blocks the uncited-quote
  channel** — shingling against the wrong translation degrades recall. Get the ruling before
  building that channel; the other two anchor channels proceed without it.

## Definition of Done (CLAUDE.md, strict)

Built AND tested AND `npm run audit` green AND RLS verified in a real two-account run AND the
accuracy-relevant numbers recorded in `WORKLOG.md` AND **actually loaded in a browser at 390px
and desktop** — a real upload driven through the UI, status watched, results clicked, no console
errors, screenshot. "Typechecks" is not "runs."

Plus Lane B's own numbers (§9): parse-failure rate by file type, anchor recall in production,
embedding cost per user, queue depth and oldest-queued age.

## Suggested order of work

1. Promote the draft to `100_user_corpus.sql`, apply to `lane-b-uploader`, verify RLS two-account.
2. Upload + parse + status, with the scanned-PDF loud failure. Nothing indexed yet — prove the
   pipeline reports honestly before it reports success.
3. Chunk + anchor. Re-measure anchor recall on the branch against the Slice 0 harness.
4. Embed with the parity check and its red-proof.
5. The three searches. Verse-anchor scan stays an index lookup — never a vector scan.
6. **The tradition-gap join**, the thing that makes this worth building.
7. The `/library/uploads` UI over the stub.
