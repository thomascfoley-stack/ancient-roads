# Owner decision sheet — 2026-07-29

Items requiring an owner ruling before an agent may implement. Each entry: facts → options → cost → recommendation → falsifiable wrong-choice condition. **Rule none** — record the ruling in `docs/DECISIONS.md` when chosen.

---

## 1. 37 missing user rows (G1 identity invariant) — UNVERIFIED

**Facts.** Pre-cutover deep-audit found G1 compares `count(*)` and `count(DISTINCT user_id)` only — not row identity/digest (`WORKLOG.md` finding 6; `scripts/cutover.mjs` + `cutover-regression-gate.mts`). Seeded corruptions (owner reassignment, soft-delete-all, anchor repoint) passed green on a prod fork. Phase 2 prod log shows empty user tables post-2026-07-28 clear (`prod-E0-E6.log` lines 63–69: highlights/notes/chats all `0r/0a/0u/EMPTY`). The historical "37 rows" figure is from pre-clear census — **no committed post-cutover identity receipt proves preservation or loss**.

| Option | Effect | Cost |
|---|---|---|
| A — Accept vacuous G1 on empty prod | Cutover proceeds; first real user protected by "nothing added" only | Cannot detect silent corruption if rows reappear mid-run |
| B — Add digest/md5 per user table before E0 | G1 catches identity/owner/anchor drift | Engineering + rehearsal on fork |
| C — Halt prod writes until manual identity census | Strongest assurance | Blocks Phase 3+ until owner runs read-only census |

**Recommendation:** **B** — the scar is real (cross-user leak passed green). Empty baseline does not remove the need for identity checks when data returns.

**Wrong if:** A real user loses a highlight and G1 still reports green at E6.

---

## 2. better-auth posture (GHSA-qq9h-g4jm-xgf3 + GHSA-g38m contradiction)

**Facts.** CI `deps` gate is **accepted-red** on GHSA-qq9h-g4jm-xgf3 (OWNER_ACTIONS §1e). `package.json` `ignoreGhsas` still lists GHSA-g38m-r43w-p2q7 with comment "LAUNCH BLOCKER, **not accepted**" — same class, same pin (`@neondatabase/auth@0.4.2-beta` → `better-auth@1.4.18`). Override to ≥1.6.22 breaks build (TS2322, verified 2026-07-29). Magic-link/email-OTP paths: grep finds zero hits in `web/src`/`src` — latent, not proven unreachable at auth-config level.

| Posture | Action | CI | Launch |
|---|---|---|---|
| **A — Accepted red (current §1e)** | Keep GHSA-qq9h out of `ignoreGhsas`; document in SECURITY.md | `deps` red until SEC-1 closes | Honest gate; blocks "green deps" narrative |
| **B — Ignore with justification** | Add GHSA-qq9h to `ignoreGhsas` after auth-config audit proves magic-link/OTP unreachable | `deps` green except g38m | Risk: second silenced account-takeover advisory |

**Recommendation:** **A** — matches §1e ruling; do not add GHSA-qq9h to ignore list until SEC-1 migration closes both advisories properly.

**Wrong if:** A public user can complete magic-link or email-OTP sign-in and CI `deps` is green.

**Falsifiable alignment check:** After any ruling, `package.json`, `docs/SECURITY.md`, and `scripts/deps-audit.mjs` output must agree.

---

## 3. DEEPINFRA_API_KEY for CI

**Facts.** `section-vector-pairing.test.ts` re-embeds with the shipped model to catch content↔vector mispairing. Without `DEEPINFRA_API_KEY`, suite announces `::warning … NOT RUN` (`loud-skip.ts`). Not a workaround candidate — faking embeddings would not catch rotation defects.

| Option | Effect | Cost |
|---|---|---|
| A — Set repo secret | Pairing check runs in `db-invariants` | API spend + secret rotation discipline |
| B — Leave unset | Job green with loud skip; ceiling allows ≤2 skipped suites | Latent mispairing class unguarded in CI |

**Recommendation:** **A** when CI secrets are configured; until then **B** with skip ceiling (ADR-035 ratchet).

**Wrong if:** A vector rotation ships and CI never ran the pairing suite.

---

## 4. barnes-notes — 1,300 sections, biblehub provenance

**Facts.** `prod-E0-E6.log` G6 sections-store warning (lines 91, 340, 446, 696, 769): 1,300 `barnes-notes` sections carry forbidden biblehub provenance, `status=staged`, not reachable via reader publish switch. Flat-embeddings ratchet does not count this store. E4 skipped `barnes-crosswire-nt` (all 1,300 flat rows biblehub — `log` lines 479, 638).

| Option | Effect | Cost |
|---|---|---|
| A — Quarantine + re-ingest from CrossWire | Clean sections store | Ingest slice + owner re-source ruling |
| B — Delete staged sections | Removes debt from DB | Loses pilot work; needs refill |
| C — Leave staged (current) | Not served via publish switch | Debt remains; search/FTS holes possible |

**Recommendation:** **A** — aligns with SECTION_PROVENANCE_DESIGN; staged must not become served accidentally.

**Wrong if:** `/api/work/barnes-notes` or search returns biblehub bodies after publish.

---

## 5. Four all-forbidden works (E4 declared skips)

**Facts.** E4 skipped with declared forbidden-provenance policy (`prod-E0-E6.log` lines 479–482, 638–640): `barnes-crosswire-nt` (1,300 rows), `scofield-crosswire` (1,215), `pnt-crosswire` (288), `poole-tcp` (1,308) — all flat pools are biblehub, not the named clean editions.

| Option | Effect | Cost |
|---|---|---|
| A — Re-ingest each from named edition | E4 can slice clean pools | Four ingest adapters + license checks |
| B — Quarantine manifest entries | Stops false labels | Removes voices until refill |
| C — Owner rules per work | Mixed | Decision latency |

**Recommendation:** **C** with default **B** until A completes per work — do not slice biblehub into clean slugs.

**Wrong if:** Any skipped work gains sections without a clean ingest receipt.

---

## 6. 50,618 commentary_entries finding

**Facts.** `WORKLOG.md` (2026-07-29): 50,618 forbidden-provenance rows sit **inside the served predicate** of `commentary_entries` (44.1% of 114,834-row served FTS pool). Independent of flat `embeddings` ratchet (71,884 forbidden on prod per `prod-E0-E6.log` line 732). `GET /api/search/commentaries` can return them.

| Option | Effect | Cost |
|---|---|---|
| A — E3-style delete after re-ingest | Shrinks forbidden pool | Deferred slice; floor impact measured (580 verses) |
| B — Tighten served predicate now | Stops exposure | May drop voices below ≥2 floor |
| C — Document-only until ingest | No immediate change | Exposure continues on search API |

**Recommendation:** **A** in dedicated slice after re-ingest exists (ADR-030 correction) — **not** in Phase 2 cutover.

**Wrong if:** Search returns biblehub/HCF bodies after owner declared them withdrawn.

---

## 7. Phase 4 deploy sequencing (E5 / G7 / G4 window)

**Facts.** Phase 2 prod completed E0–E4/E6 on prod DB (`prod-E0-E6.log`); **E5 never ran** (line 729). Deployed app is pre-025 code on post-025 schema — G4 window OPEN: live `upsertNote` rejected (`log` lines 335–337). G7 live `/ask` never run (`log` lines 96–102, 720–726). Note-saving broken E1→E5.

| Option | Effect | Cost |
|---|---|---|
| A — E5 immediately after DB cutover | Closes G4 window | Deploy without G7 live probe |
| B — E5 + G7 cookie probe same session | DB + live verifier checked | Needs `CUTOVER_ASK_URL` + session cookie |
| C — Freeze prod DB writes until deploy ready | No widening G4 window | Ops delay |

**Recommendation:** **B** — deploy is not done until G7 runs once with authed cookie (`CUTOVER_DESIGN.md`).

**Wrong if:** Owner saves a note on prod after E1 and before E5 deploy.

**Authorization note:** Prod E5 requires `CUTOVER_OWNER_GO_QUOTE` at invocation (ADR-037) — not a flag introduced in the same PR as the deploy step.
