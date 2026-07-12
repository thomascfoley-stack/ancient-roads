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
| Work | Tradition | Edition (translator, year) | Source | Match score | Entries | Status |
|---|---|---|---|---|---|---|
| _(none yet)_ | | | | | | |

## 2. Quarantined (reversible) + why
_(none yet)_

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

## 7. Parked / worries
_(none yet)_
