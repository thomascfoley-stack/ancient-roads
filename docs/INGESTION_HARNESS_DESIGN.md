# Ingestion Harness — Design

**Status (honest, 2026-07-16): GATES IMPLEMENTED ON THE LEGACY PATH; the full status-gated harness lands
with migration 006.** The earlier "Phase 1 BUILT" stamp overstated it — `src/ingest/ingest-harness.ts` is a
thin per-work digest over existing adapters, and this doc's full `staged → published` status machine is
coupled to the 006 `sources.status` column, which now holds 4 works (the 2-work commentary pilot plus the
v2 josephus-whiston historian and spurgeon-talks-to-farmers sermon, both staged). What IS live:

- **`pnpm gate:ingest`** (`src/ingest/gate-ingest.ts`) — the gates wired as one entrypoint that CALLS the
  existing modules (license-manifest, licensing, legal-corpus, check-corpus-coverage, content-sanity,
  resource-textmatch, verse-key-gate), ordered by reversibility: irreversible license/provenance gates
  first. Corpus mode + per-work mode (`--work --jsonl --match-author`).
- Gates proven **red on the real Barnes defect, then green after repair** (2026-07-16): verse-key
  distribution, count-parity (caught the matthew-henry chunk-duplication in the 006 pilot), sampled
  content-sanity, chapter-grain text-match (caught that biblehub Calvin is a different edition — 36%
  repair ⇒ re-source, not flag-flip), staged-source provenance (caught barnes-notes staged with a
  biblehub URL).
- `ingest-harness.ts` now imports the Gate B rules instead of re-inlining them.

The state machine, digest batching, decision tree, and fresh-vN generation below remain the design of
record for the 006 cutover. Owner: Thomas. Author: PM.
_(Original status: awaiting owner go-ahead for Phase 1; no harness code until approved.)_

## Purpose

We have hand-run the same ingestion/quality loop ~8 times this session (helloao, patristic, CrossWire-5, the routing + pool + cap slices). It works, but a human sits *inside* every fix decision, so it does not scale to the ~400+ works in `ACQUISITION_MANIFEST.md` (Bibles, commentaries, sermons, historians). This harness moves the human *onto* the loop — approving content and clearing escalations — instead of *inside* it.

**Design goal:** every mechanical step automates; the human touches only (a) the per-work content gate, made cheap and batched, and (b) the publish boundary (legally irreversible) and genuine escalations. Human effort per work collapses from a debugging session to a one-glance yes/no.

## The canonical loop (what is being automated)

```
acquire (adapter) → license/provenance gate → text-match vs clean PD reference
  → classify (repair $0 / re-embed / quarantine) → ingest → coverage + license gates
  → re-measure held-out eval → diagnose by failure code → auto-apply fix (decision tree)
  → re-measure → [pass ⇒ STAGE] / [escalate]      ...then human: approve → PUBLISH
```

Most of this exists: the `SourceAdapter` contract, the shingle text-matcher, both gates, the re-measure harness, and the failure-code diagnosis. The harness is the orchestrator that runs them end-to-end and decides between them.

## Autonomy model (from owner: per-work checkpoint + auto-decide/batched)

Three tiers, by reversibility:

1. **Auto (no human):** everything up to a *staged* state — acquire, gate, match, classify, ingest-to-staging, re-measure, and the deterministic fixes. Staging is reversible (nothing served), so full autonomy is safe here.
2. **Per-work checkpoint (batched digest):** a work moves from `staged` to `published` only on human approval. Approvals are delivered as a **batched digest of pre-verified cards** — you clear N at once, not one modal per work. "Work" = a distinct source-work (Spurgeon corpus, Josephus), never per-item.
3. **Publish (hard human gate):** the digest approval *is* the publish authorization. Licensing is legally irreversible, so this gate never auto-fires — a work with a passing license gate is *eligible* for the digest, never auto-published.

## The per-work digest (the human touchpoint, made cheap)

Each card is a one-glance decision the harness has fully pre-verified:

- **Work + source** (e.g. "Barnes' Notes — CrossWire SWORD module").
- **License + provenance:** license class, source URL, translator/edition + year, forbidden-domain check result. Green only if it passed Gate B.
- **Match result:** % repair ($0) / % re-embed / % quarantine, from the shingle matcher, with 2-3 sampled verse comparisons (stored text vs PD reference).
- **Accuracy delta:** the work's effect on the held-out eval (per-category + failure codes), measured in staging.
- **Recommended action + rationale** (Publish / Quarantine / Escalate) so the default is one keystroke.

Approve/reject per work in bulk. Rejections go to `quarantined` (reversible), never deleted.

## Failure-code → fix decision tree (the auto-decide core)

The diagnosis is already coded (`no-content` / `wrong-passage` / `<2-voices` / `verifier-fallback`). Map each to a fix the harness applies without asking:

| Failure code | Meaning | Auto fix |
|---|---|---|
| `no-content` | corpus lacks the passage | queue a covering work from the manifest for the next ingest (escalate if none exists) |
| `<2-voices` | right passage, one author | author-diversity selector (per-author cap) — already the mechanism |
| `wrong-passage` | drift to a similar passage | reference/pericope routing if a ref resolves; else flag as reranker-drift (escalate class) |
| `verifier-fallback` | non-verbatim / interpretation | compose/faithfulness — always escalates (never auto-touch the verifier path) |

The tree only *applies known fixes to known failure classes*. A failure that does not map cleanly is a **novel fork → real-time escalation**.

## Escalation policy (auto / batch / real-time)

- **Auto-apply + log:** deterministic tree fixes, quarantine-on-gate-fail, $0 provenance-repair on a clean match. Rationale written to a run log for audit.
- **Batched digest (async):** per-work publish approvals; reviewable-but-not-novel calls (e.g. a work with a borderline match rate).
- **Real-time stop:** genuine novel forks only — a licensing ambiguity the text-match can't resolve, an accuracy regression the tree can't self-correct, a fix that needs a design decision, or a failure class the tree doesn't cover. These are rare by construction and are where the PM/owner earns their keep.

## The held-out eval as a moving target

The frozen set becomes a *dev set* the moment fixes are measured against it (this already happened to v2). The harness must:

- Iterate fixes on the current dev set freely.
- **Auto-generate a fresh vN held-out** (same methodology: stratified sampling + authoritative labels, frozen + hashed) before any *publish-affecting* decision or beta gate. Ship on the fresh set, never the tuned one.
- Keep the pre-registered per-category bars; a work publishes only if it does not regress them on the fresh set.

## Throughput & resilience (where batch jobs slow)

Reuse what's built, make it standard:

- **Resumable + idempotent** (`ON CONFLICT DO NOTHING`); a killed job resumes, never double-ingests.
- **De-poison** (batch fail → per-item retry) and **adaptive truncation** (never drop a text) on embedding.
- **Rate-limit-aware** backoff on DeepInfra + polite, cached, resumable fetch on HTTP sources (no re-hammering New Advent/archive).
- **`COPY` bulk inserts**, embeddings/LLM off the request path.
- **Staging isolation:** ingest writes to a staged state that production retrieval never reads until publish.

## Work state machine

`discovered → acquired → matched → staged → (digest) → published | quarantined`

- Every transition logged with rationale.
- `quarantined` is reversible (revive if a PD source later surfaces).
- Only `published` is served, and only behind the gates.

## What stays human (by design)

Not a limitation — the point. Publish approval (licensing irreversibility), novel failure forks, the ship/beta gate, and licensing edge cases the matcher can't resolve. The harness is measured by how *few* real-time stops it produces per 100 works, not zero.

## Phased build (prove deep before wide)

1. **Orchestrator + state machine + per-work digest** over the *existing* adapters (helloao, New Advent, CrossWire) — prove the loop end-to-end on works already understood.
2. **Decision tree + escalation log** — auto-apply the known fixes, batch the rest.
3. **Fresh-vN auto-generation** — close the dev-set-decay hole.
4. **New adapters** (sermons: Spurgeon; historians: Josephus) — the loop is now the same engine, new source.

Ship phase 1 on one real ingestion before generalizing.

## Operational settings (locked by owner)

1. **Digest cadence — event-based, not scheduled.** A digest posts when a source-work finishes staging (one distinct work = one card when ready; small works finishing close together batch into one digest; giant single-author corpora = one card with aggregate stats). Approve as things become ready, not on a clock.
2. **Escalation channel — chat.** Both digests and real-time escalations surface in the working chat/session. No separate tool.
3. **Pacing & alarms — pace on staged backlog, alarm on quarantine rate (raw quarantine count is uncapped — parked works are decided and fine):**
   - **Staged-backlog pause:** stop ingesting new works when the *unreviewed staged* pile exceeds **~2 source-works (or ~30 individual works)**. Keeps the harness paced to owner review instead of running miles ahead.
   - **Quarantine-rate alarm:** if a single source-work quarantines **>30%** of its content, escalate it as "source/edition likely wrong" (a full-work drop, like Origen-on-John) rather than silently parking — that's a decision to surface, not bury.
