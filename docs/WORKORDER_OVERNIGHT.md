# Work Order — Overnight (2026-07-11 → 12): grow the corpus, fix safe bugs, ship

**Mission:** MORE content across MORE traditions (archive.org primary adapter); fix the safe bugs; deploy;
verify live + mobile. Owner asleep; success = the live gated site is usable on mobile web in the morning.

**Rails:** CLAUDE.md + quality-slice. Design-doc → build for retrieval/data-model. Commit+push per change.
Verbatim only, never paraphrase a source. Park genuine forks, never guess/stall. Do NOT gut the reader,
delete content, publish anything failing a gate, touch the verifier/compose path, or implement the
tradition-aware diversity metric (owner's unmade decision).

**Pre-authorized auto-publish** (all gates or quarantine): licence recorded · provenance (permitted source +
translator/editor + edition year ≤1929) · shingle text-match proof · coverage gap = 0 · tradition tagged.

---

## 1. Content published (morning review)
**None.** The new-tradition mission requires archive.org **fresh** ingest, which hit **three genuine forks I
would not guess** (`docs/ARCHIVE_ORG_INGEST_DESIGN.md`). Publishing noisy-OCR, possibly-misaligned text into a
verbatim/attributed corpus on a guessed match-proof would violate *verbatim only / never guess / quality over
count / gate discipline*. I confirmed the data is reachable (correct PD editions: a Lapide Mossman 1908, Ryle
1857, Menno Funk 1871), designed the adapter, and proved with a POC that naive OCR containment does NOT
discriminate (same-edition 5% < different-work 9.5%) — so the OCR matcher is real engineering, not a
formality. **Three owner decisions unblock a clean build (see §7).**

## 2. Quarantined (reversible) + why
_(none — nothing ingested)_

## 3. Safe bugs fixed (none touch content/verifier)
| Item | What | Verified |
|---|---|---|
| **H1** | `getMessages` (+`getChatMemories`): added explicit `AND user_id =` belt (RLS-inert owner fallback no longer leaks another user's messages) | typecheck |
| **H2** | `addMessage` (+`addChatMemory`): IDOR-write guard — `INSERT…SELECT…WHERE EXISTS` owner check; 0 rows ⇒ throw | typecheck |
| **H4** | Rate limiter now checks the **minute bucket first**, only bumps the day bucket for requests that clear it — a min-refused burst no longer burns daily quota. + regression test | vitest (5) |
| **M4** | `/api/eval/bait` hard-gated `404` in `NODE_ENV==='production'` (paid endpoint, local-only) + 500-char cap | typecheck |
| **M8** | `api_rate_limit` opportunistic sweep (1% of checks, index-served, error-swallowed) — bounds table growth; no cron infra needed | typecheck |
| **D6** | `RATE_LIMIT_DAY` copy no longer references a nonexistent "beta" | typecheck |

Committed as one logical change (all 6 safe bugs). `npm run audit` green. Live behavioural verification of
H1/H2/H4 deferred to the deploy step (needs a session); the logic is unit-tested/typechecked.

## 4. Accuracy — before / after (frozen v3 through shipped path)
_(pending)_

## 5. Deploy + live verification
_(pending)_

## 6. Mobile (390px) findings + fixes
_(pending)_

## 7. Parked / worries — THREE OWNER DECISIONS (unblock the whole content mission)
Full detail in `docs/ARCHIVE_ORG_INGEST_DESIGN.md`. Each would corrupt a verbatim corpus if guessed:
- **FORK A — "shingle text-match proof" is undefined for a FRESH work** (nothing stored to match against).
  Recommend **cross-copy containment** (two independent PD scans of the same edition) — but the POC shows it
  needs section-alignment + threshold calibration, not naive containment. Confirm this satisfies the gate.
- **FORK B — OCR→verse-alignment is unreliable and this corpus is VERBATIM.** A wrong boundary = words
  attributed to the wrong verse (the one thing the product must never do). Recommend fresh archive.org works
  ship **staged** (NOT auto-published) until a validation pass — i.e. fresh ingests are outside the
  auto-publish pre-authorization; only provenance-*repairs* (no re-parse) are covered.
- **FORK C — non-verse `theology` works (Menno, mystics) have NO retrieval path.** Retrieval is entirely
  `verseId`-keyed. Ingesting them today = stored-but-never-retrieved. Needs the topical/`theology` retrieval
  design first. Menno Simons is blocked on this independent of A/B.

**Worry:** the content mission cannot advance to *new traditions* without these three decisions — they are
inherent to fresh-ingest, not avoidable. Provenance-repair of the existing (Reformed/patristic) tail is
fork-free but adds no new tradition. **Recommended first slice once A+B land:** J.C. Ryle on one Gospel
(single clean Anglican volume), shipped staged with an alignment validation pass.
