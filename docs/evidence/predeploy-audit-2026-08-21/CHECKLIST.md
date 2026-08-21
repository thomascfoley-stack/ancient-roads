# Pre-deploy deep audit — 2026-08-21 (union + Daily Office Sprint 1)

Five parallel lenses over what the deploy changes (attack surface · data layer ·
domain invariants · client · union/ops), per `.claude/skills/deep-audit`. Sweep
ran at `f17a329`; remediation landed at `41207a5`. Findings-only reports with
verified-clean and not-covered sections are in the session transcript; this is
the operating checklist.

## Fixed before deploy (all at `41207a5` unless noted)

- [x] **Daily Light citations fused into scripture** (domain HIGH ×2) — export splits the
  compiler's trailing citation lines into `refs` (fail-closed 366/732, grammar tolerates the
  module's own misprints `Ps 142.3`, `EPh`); page renders them as a citation line. Invariant
  test now has red-capable assertions (it caught `02-18 pm` mid-remediation).
- [x] **/plans/[id] signed-out race** (client+attack HIGH) — 401 → sign-in state; 404/400/500 →
  one plan-scoped message (no not-yours/not-exists oracle), list preserved; component tests.
- [x] **One-directional degradation on /home** (client MEDIUM) — the office composes from
  whatever loaded; Spurgeon failing is a quiet line, tested.
- [x] **CSRF floor on the plan mutation** (attack HIGH, floor only) — POST /api/plans/[id]
  requires `application/json` (forces preflight); route test.
- [x] **ANNOTATE_ALLOW_HOST prefix match** (ops HIGH) — exact endpoint-id equality.
- [x] **Reschedule TOCTOU + weight + semantics** (data MEDIUM ×3, attack MEDIUM/LOW) —
  `completed_at IS NULL` re-asserted in the UPDATE; lean read (spec + indexes, not 4,800 rows);
  unnest lengths asserted; 0-moved disambiguated (plan-gone → 404, completed-under-us → 200/0).
- [x] **Annotations input bounds** (attack MEDIUM ×2, merged lineage) — color/textColor token
  grammar (client palette unaffected), span ints bounded 0..2000, translation sliced.
- [x] **Due means due** (client MEDIUM) — home card only for `next_day_date <= today`; behind-hint
  threshold aligned to ≥2 days both sides (domain LOW).
- [x] **Office label provenance** (domain MEDIUM) — one clock for all three picks; Daily Light's
  label derives from its own entry title.
- [x] **Catch-up nag loop** (client MEDIUM) — "Keep the original dates" persists per plan.
- [x] **PlanDetail cross-plan state leak** (client MEDIUM) — keyed by plan id, previous plan
  cleared on route change.
- [x] **Toggle/reschedule dead-tap window** (client MEDIUM/LOW) — busy state holds through the re-read.
- [x] **/devotional/* uncached** (attack HIGH-adjacent egress / client MEDIUM) — Cache-Control
  1d + SWR 7d.
- [x] **served-assets baseline stale** (ops MEDIUM) — re-recorded at devotional: 2.
- [x] **Licensing record + gate** (domain MEDIUM/ops LOW) — export refuses a non-PD license value;
  `daily-light` added to `DEVOTIONAL_LICENSES`; `today.ts` guarantee header rewritten to the truth.
- [x] **serve:false pin's fourth move** — josephus→`hort-james1909`, both guards, history recorded.
- [x] isNearToday window comment corrected (the ±48h code was right; the ±1d comment was not);
  boundary now pinned by test (+1 accepted, +5 refused).

## Open — carried deliberately, owner-visible

- [ ] **CRITICAL until resolved: a second session is writing this working tree** (ask/history/
  study-entrance files, a `_probe_delete_me` tag lock). `deploy.sh` will refuse the dirty tree,
  and committing around it risks shipping a half-built feature (`library/[catalog]/page.tsx`
  imports the untracked `study-entrance.tsx` — `next build` breaks on a partial commit). The
  tree must be quiesced by whoever owns that session before ANY deploy. One-session rule
  (AGENTS.md) exists for exactly this.
- [ ] **Neon session cookie SameSite is still unaudited** (attack #1's load-bearing unknown, also
  logged 2026-08-02). Someone must read the live `Set-Cookie` off a sign-in. The Content-Type
  gate is a floor, not the answer.
- [ ] `/home` has no server-side auth check; its comment said "+ login" and never was. Decide the
  intended posture before the site gate drops (SEC-1).
- [ ] ~2.3MB of devotional JSON on /home's critical path (now cached, still heavy) — per-month
  split or CDN offload, filed.
- [ ] **Daily Light portion boundaries were flattened at ingest** (raw rows verified: hard-wraps
  mid-sentence, no structure beyond `--`). The refs field is the compiler's own map of what was
  fused. Real fix: structural re-ingest of SWORD `Daily` with portion markup.
- [ ] `daily-light` missing from `DATA_SOURCES.md`'s registry (record exists in DB + licensing.ts).
- [ ] Reschedule UPDATE ownership-belt has no direct test (the read-gate test passes before the
  belt executes) — coverage debt if the pre-read is ever removed.
- [ ] Partial index `plan_days(plan_id, day_index) WHERE completed_at IS NULL` if the listPlans
  LATERAL ever measures hot (LIMIT 100 bounds it today; no EXPLAIN was run).
- [ ] `naves-topical` vs `naves-topical-bible` duplicate manifest slugs (jfb-class disease).
- [ ] `plans.updated_at` is creation-order (nothing bumps it; 106 forbids UPDATE on plans) —
  surfaces as list order; needs its own migration if rename/bumping ever ships.
- [ ] Signed-in browser walk of /home, /plans/[id], catch-up, grid on prod after deploy — the
  standing gap (no auth env locally); jsdom + real-DB route tests only.

## Not covered (the gap that stays visible)

Neon Auth internals (cookie flags, session rotation) · `/api/plans/topics` internals · a live
`EXPLAIN` on the LATERAL · real-device perf of a 728-day grid · `next build` at the audit moment
(ran green in `npm run audit` before the sweep; the tree mutated after) · the other session's
in-flight files (ask/history/study-entrance + user-corpus probes) — explicitly NOT reviewed here.
