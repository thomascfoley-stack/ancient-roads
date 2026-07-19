# Go-Live Execution — finish the run, fix the two prod landmines, deliberate prod cutover

Continuation of the go-live run (branch `golive`, Phases 0–2 done: verifier hole closed, schema landed on dev, register-aware read path built + confirmed on 3 real seeds). This is the plan to get it **tight on dev tonight → fix the two live prod landmines → deliberately push to prod → serve the content.** Owner has authorized a prod push *after* the gates below are green.

## Guardrails (carried forward, plus the prod delta)

- Everything in **Part A/B runs on the dev Neon branch**. Byte-sync `src/` ↔ `web/src/` for any contract/verifier/prompt edit (both trees atomically). Fail closed everywhere; license fail → quarantine; never store copyrighted full text. Embed whole (no `MAX_EMBED_CHARS` truncation). Prove every gate red-first. Commit per logical change, push.
- **Part C touches prod** — it is the deliberate push the owner is now authorizing. It requires prod credentials supplied to that session (or the owner runs the two irreversible steps: the Vercel deploy and the prod-migration apply). Secrets live in the environment, never committed. Every prod step is additive/reversible-where-possible with a rollback noted.
- **Part C is gated on Part A being green + audited.** No prod push before the eval-regression gate passes and the fresh-agent deep-audit is clean (CLAUDE.md hard rule).

---

## PART A — finish the run on dev (green, audited branch)

**A1. Eval-regression gate FIRST (blocks everything).** Phase 2 widened `LEGAL_CORPUS_FILTER` (9 authors → 23 slugs) and added the register pools. Re-run the frozen held-out accuracy diagnostic on the **live** `routing.ts` path. Record per-category numbers in `WORKLOG.md`. **Commentary must not regress** vs the last recorded baseline. If it regresses, stop and fix the filter before anything else — do not proceed to ingest.

**A2. Build the adapters (real acquire).** Per `INGESTION_ADAPTERS.md`, writing through `register-writer.ts`: `ccel` (ThML→text, strip markup, chunk-on-structure, `{01..63}` range + author-page expansion), `gutenberg` (strip license boilerplate, isolate the sacred section). `helloao` fetch already exists; extend `sword`. Real fetch, resumable, cached, polite backoff. Chunk **whole**, under the embed budget.

**A3. Run the 46-work queue on dev**, through the loop breakers (staged-backlog pause, quarantine-rate >30% alarm):
- Skip the `josephus-works` dupe; `origen-commentary` and `thayers-lexicon` → **staged only** (not served).
- `herbert-temple` → **quarantine this run** (its CCEL ids 404); repoint to Wikisource in a follow-up.
- Historians (`schaff-history`, `edersheim-lifetimes`, `josephus-works`) → **staged, not served** (write-contract: chunk-on-headings, `period_*`).
- Clean PD/CC tier is **owner-authorized to auto-publish** once Gate B + quality gates pass. Copyrighted/ambiguous → escalate.
- **Chrysostom/Augustine (`chrysostom-homilies`, `augustine-homilies`) are the landmine-2 re-source** — ingest the clean CCEL/Schaff NPNF versions here (see Part B2).

**A4. Regenerate the static reader JSON + FTS columns** for the new registers, so the reader/Today surface serves them (`legal-corpus.ts` allowlist already extended in Phase 2).

**A5. Confirm both surfaces on bulk dev data** — a hymn, a poem, K&D, Spurgeon, Maclaren each retrievable in `/api/ask` (register-scoped, labeled, never composed over) AND rendered in the reader/Today. Browser-verify at **390px + desktop**, console clean, a real interaction. Re-run A1's eval once more against the now-full corpus; record.

**A6. Fresh-agent `deep-audit`** over the go-live diff + a sample of published rows (an agent may not audit its own output). Resolve or escalate every finding.

**Part A output:** a green, audited `golive` branch; dev DB holding the full clean-tier corpus; eval clean; both surfaces confirmed.

---

## PART B — the two prod landmines (prepped on dev, applied in Part C)

**B1. `app_runtime` write grant (security).** Migration `010` REVOKEd corpus writes but `section_anchors` / `section_embeddings` were dev-only. Write migration `021_revoke_app_runtime_anchor_writes.sql`: `REVOKE INSERT, UPDATE, DELETE ON section_anchors, section_embeddings FROM app_runtime` (SELECT only). **Confirm the ingest/migration path runs as the owner role, not `app_runtime`**, or the REVOKE would break it. Verify with the `role_table_grants` query (expect SELECT only). Prove on dev first.

**B2. `historicalchristian.faith` provenance (licensing — the existential one).** Chrysostom/Augustine are served in prod with forbidden-aggregator provenance. **The A3 ingest re-sources them from clean CCEL/Schaff NPNF** — that's the fix. The remaining step: **remove/quarantine the old `historicalchristian.faith`-provenance Chrysostom/Augustine rows** from the served `embeddings` corpus, and point the `LEGAL_CORPUS_FILTER` Chrysostom/Augustine coverage at the new clean rows. Verify: the **forbidden-provenance ratchet is green** (zero served rows with `historicalchristian.faith`), served Chrysostom/Augustine now carry CCEL provenance, and coverage didn't shrink. Keep the removed rows recoverable (they're re-ingestable) — no hard delete without a backup.

---

## PART C — deliberate prod cutover (owner-authorized; needs prod creds)

**Precondition:** Part A green + audited, eval clean, Part B verified on dev.

**C1. Apply migrations to prod** (owner-run or owner-supervised): `016`→`023`, in order (`022` = embeddings write-policy RLS fix, `023` = sources status `'ingesting'`; `018`/`019` via the concurrent runner — see the Part C runbook in `GO_LIVE_STATUS.md`). All additive/reversible. Verify each landed (`role_table_grants` for `021`; CHECK constraints for the source_type widenings).

**C2. Deploy code to prod** (Vercel) — the verifier fix, `routing.ts` register path, reader changes. This is the irreversible outward step; owner runs it or explicitly authorizes it in-session.

**C3. Run the ingest against prod** (idempotent, `ON CONFLICT DO NOTHING`) — fills the register content and writes the clean Chrysostom/Augustine. Same license gate, same breakers. Does not touch existing commentary. ⛔ **Never branch-promote the dev Neon branch onto prod** — that replaces the prod DB wholesale and wipes live user data (highlights/notes/waitlist), which lives only on prod. A fresh re-ingest (paying the re-embed cost) is the only safe path.

**C4. Apply the landmines to prod:** the `021` REVOKE (C1 covers it) and the B2 removal of the forbidden-provenance rows.

**C5. Verify on prod:** both surfaces serve the content (spot-check a hymn/poem/K&D/Spurgeon); run `eval-heldout --v4` against prod — **v4 is the frozen instrument** (v3 is a dev set per `HELDOUT_EVAL_DESIGN.md`; do not gate prod on it) — **no regression vs the dev v4 run**; `app_runtime` = SELECT only; forbidden-provenance ratchet green; verifier fails closed on a seeded bad block. Record all numbers in `WORKLOG.md`.

**Rollback:** code → redeploy the prior Vercel build; content → the new register rows are additive and can be filtered out by reverting the `routing.ts` register constant; migrations are additive (no destructive change); the B2-removed rows are re-ingestable. Nothing in this cutover hard-deletes prod data.

---

## Still escalated to the owner (decide before/at Part C)

- **Origen MUST_NOT_SERVE:** staged, not served, by default. Whether a contested father (condemned 553) ships as a served attributed voice is your editorial call — I can pull the rule's rationale before you decide.
- **Herbert's *Temple*** source: quarantined this run; repoint to Wikisource in a follow-up.
- **Everything previously parked** (art, the 006 GA cutover, OCR tier, sermon-search moat) stays parked.

## Definition of done

Full clean-tier corpus **live on prod, both surfaces**, retrievable + rendered, browser-verified. Commentary accuracy not regressed (eval recorded, prod). Historians ingested-staged. Both landmines fixed on prod: `app_runtime` SELECT-only on the anchor tables, zero served rows with forbidden provenance. Verifier fails closed. Art parked. `WORKLOG`/`ROADMAP`/`STATE_OF_TRUTH` reconciled. Rollback path confirmed.
