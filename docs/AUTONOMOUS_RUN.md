# Autonomous Run — standing work order (unattended / overnight)

Point Claude Code at this file for a long unattended session ("follow `docs/AUTONOMOUS_RUN.md`"). It is the prioritized queue + the rails. Specs live in the linked docs; this file governs *how* to run without a human present.

## Operating rules

- Follow `CLAUDE.md`. **Log every unit of work to `WORKLOG.md`** (what you did, the result, what's next) — not just chat. Commit per logical change and **push to `origin/main`**. Keep `npm run audit` green.
- **NEVER sit idle waiting for me.** If a task reaches a human-decision or approval gate, do the *safe* part, **stage** the part that needs me, write the exact decision needed under `WORKLOG.md` → "Needs Thomas", and **move to the next task.** There is always more queued work below.
- Record the accuracy diagnostic number every time you touch retrieval. Never expand the corpus while accuracy < 10/10.

## Hard rails — NEVER do these unattended (prepare + stage them for review instead)

- Do **not** drop or truncate `commentary_entries` / `embeddings` (irreversible).
- Do **not** cut teacher retrieval over to a new path — build it alongside, prove parity, and leave the cutover for review.
- Do **not** deploy to prod, change prod env vars, or touch the `SITE_PASSWORD` gate.
- Do **not** publish/migrate any source without a confirmed PD/CC license (fail closed → quarantine).
- Do **not** rotate secrets or run destructive migrations against prod data.
- Anything irreversible or user-facing-in-prod: **stage it, log it under "Needs Thomas," continue.**

## Priority queue (work top-down; each item is safe to run unattended)

1. **Accuracy → 10/10 (the main event).** Run the 10-query true-success diagnostic on the full pipeline (full-corpus embed + hybrid + reranker); record the number in WORKLOG. If < 10/10: categorize failures (wrong-source / thin-coverage / compose), iterate — hybrid `tsquery`, reranker, candidate-pool size, chunk/anchor quality — and re-run + record after each change. Re-run `interpretation_bait`; confirm zero guardrail failures. Continue until 10/10 **or a genuine plateau** — if plateaued, write the failure breakdown + hypotheses to WORKLOG and move on (don't spin on the same idea). Bounded model/embed spend is fine (within budget).

2. **Phase 1 Bibles** (`INGESTION_TASK.md` — independent of retrieval, additive, reversible): ingest BSB (primary, PD) + the PD set (WEB, KJV, ASV, YLT, Darby) into the reader's bible store, each with a provenance/license record.

3. **Phase 0 prep — build, do NOT apply** (`INGESTION_TASK.md` Appendix A): create migration `006` (the `sources`/`sections`/`section_anchors`/`section_embeddings` tables + grants; `model_slug = bge-large-en-v1.5`). Draft `ingest/sources.config.json` — the per-source license map from `DATA_SOURCES.md`, quarantining anything not clearly PD/CC. **Do not backfill `sources` or cut retrieval over.** Stage the config + migration under "Needs Thomas" for my license-map review.

4. **Reader highlighter + floating popovers — BACKEND + functional UI only** (`docs/HIGHLIGHTER_POLISH.md`): **independent of the accuracy work** (touches the reader, not the teacher) — ideal fill during accuracy's long embed/diagnostic waits. Build the schema (sub-verse character range + `text_color`, migration + grant `app_runtime`), API, sub-verse rendering, both color axes wired, and floating popovers (Floating UI/Radix, portal + collision). **Resolve the translation-switch offset decision in `WORKLOG.md` before building it.** Make it *work* — do NOT attempt final visual polish; the design fine-tuning is Thomas's morning **Fable** pass. When it's functional, note in WORKLOG "highlighter ready for Fable design pass" and move on.

5. **Engineering-excellence backlog** (safe filler — do between/after the above; all reversible, all inside the gate): fully wire `web/` typecheck + lint into `scripts/audit.sh`; add web smoke tests for the critical routes (`/ask`, reader, annotations); set coverage thresholds on `src/verifier`, `src/retrieval`, and the teacher; write `docs/RELEASE.md` (deploy checklist + rollback runbook).

6. **Design-only, no build** (`QUERY_INTENTS.md`): write the design for the intent classifier + the Type-1 topical/verse-retrieval layer (TSK/openbible index + optional verse embedding), for my review. Gated behind accuracy — design only.

## The honest goal (read this before optimizing)

An unattended night does **not** produce ship-ready. It produces **verifiable, committed, green progress with evidence for every claim**, handed to a clean morning review. **Optimize for *provable* progress, not *claimed* completion.** Do not report anything "done" that a reviewer reading the actual repo would disagree with. Ship-ready requires human verification + the pre-signup gate; that's not tonight's job.

## Failure modes & safeguards (what goes wrong in unattended runs — combat each)

1. **Faking / overstating success** (claiming 10/10, "tests pass", "done" without it being true — the #1 unattended-run failure). → **Every claim needs evidence pasted into `WORKLOG.md`: the exact command + its output/number.** No accuracy number without the command that produced it. A green check is not proof. Assume a skeptical reviewer will re-run everything in the morning.
2. **Spinning on one hard problem** (burning the whole night re-trying the same idea). → **Attempt-box: max 3 iterations on any single failure.** If unsolved, write the failure + hypotheses to WORKLOG and **move to the next queue item.** Never repeat the same approach hoping for a different result.
3. **Scope drift / "helpful" over-building** (unasked refactors, speculative abstraction, inventing work). → **Do ONLY what the queue lists.** No refactors beyond the task, no new scope. If idle, harden tests and the WORKLOG — do not invent features.
4. **Breaking the build / committing red.** → **`npm run audit` green before EVERY commit. Never commit red.** If a change can't go green, **revert it** — do not commit broken, do not disable/loosen the gate to pass.
5. **Weakening the guarantee to move a number** (loosening the verifier/screens to hit accuracy 10/10). → **`interpretation_bait` 0-breaches after every retrieval change (35/35 = a ~92% lower bound; claiming ≥99% needs ~300 clean cases — never claim ≥99% off n=35); the integrity core (verifier/prompt/contract) stays byte-identical + sync-guarded. NEVER loosen a gate or screen to pass.** If accuracy and faithfulness ever conflict, **faithfulness wins.**
6. **Overfitting accuracy to the 10 queries** (tuning to the test). → **10/10 on the diagnostic is a smoke test, not proof.** Also run a broader/held-out query set and report both numbers. Don't special-case the 10 queries.
7. **Cost blowout** (runaway paid embed/LLM calls). → Jobs must be **bounded, idempotent, resumable** (re-runs skip done work — never re-spend). If a job would exceed a sane spend, stop and log.
8. **Irreversible / destructive actions.** → Enforce the Hard Rails above, plus: **no `git reset --hard`, no force-push, no dropping/truncating data, no prod changes.** Stage anything irreversible for review.
9. **Losing work / git chaos.** → **Commit per logical change and push after each.** Never leave a large uncommitted tree. Small, clean, single-purpose commits. **One session on the tree** — if another process holds the git lock, STOP and log (don't force).
10. **Context rot over 8 hours.** → The docs are your memory — **re-read `CLAUDE.md` + this file periodically.** Work in discrete committed units so state lives on disk, not in context. Keep WORKLOG current as external memory.
11. **"Functional" mistaken for "done."** → **Done = real path + real data + tested + gate-green + evidence in WORKLOG.** "Functional with fakes / not real-data-tested" is reported as exactly that — not done.
12. **Migration hazards** (non-idempotent, missing `app_runtime` grant — the recurring bug). → Every migration **idempotent + re-runnable**; DDL as owner + explicit `GRANT ... app_runtime`; verify the grant works *as* `app_runtime`; fail closed.

13. **Empty / incomplete / orphan corpus rows** (silent partial ingests — how the 51% dedup loss hid). → Every source ingest must pass the **Corpus Integrity Gate** in `INGESTION_TASK.md` before it's marked done/`published`: count parity, no empty bodies, provenance+license present, referential integrity, embedding completeness (verified two ways), sampled content sanity. **Log the actual counts in WORKLOG.** No single green check is trusted; a failing source is quarantined, not published.

## End-of-run summary (required)

Before stopping, write a `WORKLOG.md` summary: the final accuracy number; what landed (with commits); what's **staged for review** (license map, migration 006, retrieval cutover, any design docs); and anything blocked on a decision under "Needs Thomas." Leave the tree committed, pushed, and green.
