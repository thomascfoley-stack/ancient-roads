# UX remediation — roadmap to finish

**Purpose: judge progress.** The spec (`docs/UX_REMEDIATION.md`) says what each block is; this says
what order, what it costs, and what is actually blocking. Re-measure it — do not read it as current
without checking `git log` and the spec's §1 board.

Last measured: 2026-08-07, branch `fix/L2` @ `7bc3bdd`.

## Governing documents, and how they relate

| Doc | Role | State |
|---|---|---|
| `docs/UX_REMEDIATION.md` | **The master doc.** 19 blocks, 5 waves, status board §1, per-block exit tests | Live; v1.4 |
| This file | Sequencing, sizing, blockers | New |
| `docs/evidence/predeploy-audit-2026-08-07/CHECKLIST.md` | 59 audit findings — **belongs to no wave** | 2 closed, 57 open |
| `docs/pm/MASTER.md` | Repo programme sheet (Lanes A/B) | **Had no row for this work until now** |

**Three streams run in parallel and only one is in the spec.** That is the thing to hold onto when
judging progress: closing spec blocks does not close the audit findings, and neither closes the
deploy.

## Where we actually are

**Done:** `R0` (recon — killed 4 false "reuse" claims), `INSTR` (diagnosed both loops).
**Partial:** `L2` step 1 — migration 106 applied to production; `Mark as read` and `Delete plan`
work for the first time ever. Step 2 (optimistic toggle) deferred to the next deploy.
**Deploy blockers:** 3 of 5 closed (lockfile, its guard, A1). 2 open — CI red, rollback doc.
**New from A1:** a CRITICAL ReDoS and two HIGHs that are live on production now, independent of the deploy.

Everything else is `-`.

---

## Stream A — get a deploy out (the current bottleneck)

Three separate items are stuck behind this: `L1`'s retry control (already written, undeployed),
`L2` step 2, and the UX-5 sidebar work. **Nothing client-side reaches users until this ships.**

| # | Item | Size | Gate |
|---|---|---|---|
| A1 | ~~Re-run the attack-surface audit lens~~ **DONE 2026-08-07.** Split into two lenses (upload/parse, routes/authz); both completed. **20 findings, 1 CRITICAL, 3 HIGH.** All 26 API routes now audited. Two reproduced independently. Verdict shifted: the deploy was blocked on a build failure, it is now blocked on **security** | done | — |
| A2 | Push `fix/L2`; get CI green. `db-invariants` is red on `main` (`work-reader.test.ts:246`, 429-before-400) — unknown if flaky | 1 session | may be a real bug |
| A3 | Fix `DEPLOY_PREFLIGHT.md`'s rollback target — it names a 3-week-old deploy as live and points recovery at a bundle predating migrations 044/045 | small | — |
| A4 | **Deploy** | ⚑ owner | A1–A3 |

**A4 is the milestone that unblocks the most.** Until it lands, client work accumulates unshipped.

## Stream B — the spec's remaining blocks

Ordered by the spec's waves. Sizes are from `R0`'s findings, not guesses.

### Wave 1 — finish the loops
| Block | Size | Note |
|---|---|---|
| `L2` step 2 | small | Optimistic toggle. Ships with A4 |
| `L2c` | small | Title via `BOOK_BY_SLUG` (exists); 2 unpinned date call sites. Needs a `zh-CN` browser check |
| `L1` | small | Retry already written at HEAD. Remaining: guard the unhandled-throw path |
| `L1b` | **decide first** | Its premise is wrong — measured 104s/58s against the block's "18s/45s". The 15s threshold must be re-derived |

### Wave 2 — names and IA
| Block | Size | Note |
|---|---|---|
| `L2b` | small | Derive weeks from `chapterCount`. Confirmed broken live |
| `N1` | small | ~10 label sites (`R0` enumerated them). Has a `HUMAN` check |
| `N2` | small | **Already shipped — but the audit found the mask erases focus rings on visible rows (WCAG 2.4.7).** This is now a fix, not the original work |
| `N3` | medium | `N3b` reduced to one step. `N3a`'s hydration gap is **unverified — may not exist** |
| `N4` | medium | ⚑ Two owner dispositions embedded: channels route (redirect vs 404), and existing objects |

### Wave 3 — mostly blocked
| Block | Blocker |
|---|---|
| `T1` | ⚑ **Auth migration** — does not exist yet. Also needs a pre-change baseline metric recorded *before* shipping |
| `T2` | ⚑ **Auth migration.** Mostly evaporates if it happens |
| `T3` | **`DEVICE` checks only.** I can never close this — needs a person on real iOS + Android |
| `T4` | ⚑ **Owner decision**: dormant column vs. schema migration (flagged in-block) |

### Wave 4
| Block | Note |
|---|---|
| `S1` | ⚑ Partly blocked — needs a product screenshot and real privacy/terms/contact content |
| `S2` | 9 items; several need a browser. Largest agent-doable chunk left |

**Wave 5 (`PR1a`/`PR1b`/`PR2`) is product, not remediation.** Spec §10 excludes it from the
definition of done. `PR1a` also grew: `R0` found the Channels shell it was to reuse is
localStorage-only, so it must build its own persistence.

## Stream C — audit findings (54 open, 0 CRITICAL)

**A1 added 20, and three of them are not deploy blockers — they are live defects on production
today**, reachable by any signed-up account once the preview gate comes off:

- ~~**A1-1 CRITICAL** — .docx ReDoS~~ **FIXED 2026-08-07 (`1ab40de`)**, red-proofed; 5657-11260×
  faster at 256 KB, full web suite green.
- ~~**A1-2 HIGH** — Better Auth's in-memory limiter~~ **FIXED 2026-08-07 (`3426186`)**, red-proofed
  under real concurrency (50 simultaneous → exactly 3 allowed, no lost updates). No migration
  needed; `api_rate_limit` already existed.
- **A1-3 HIGH** — one attacker can exhaust the 2,000/day global ask ceiling and take `/ask` offline
  for everyone. Holds even after A1-2 is fixed.

Also **A1-11**: the pdfjs "RCE fix" (`d589140`) is a version bump whose stated mechanism is not
corroborated by its own before-state — `isEvalSupported`/`new Function` occur zero times in *both*
versions. The commit's claim should be corrected in repo history rather than left standing.



Not in any wave and mostly not blocking, but two deserve scheduling:

- **No grant-parity check exists** (finding 11). The outage that cost two features tonight would
  recur silently on the next post-032 table. This is the durable cure.
- **`SCHEMA_AS_BUILT.md` documents nothing after migration 024** (finding 12) — the same
  stale-doc-cited-forward mechanism that caused the outage, in the file `AGENTS.md` names as a
  task entry point.

Also 13 documentation defects from this session's own commits (findings 18–30), including
"6 commits behind" wrong in all five places I wrote it.

---

## Can this finish "tonight or in the next day or two"?

**No, and the reason is not effort.** Waves 1–4 cannot *close* regardless of how fast the work goes:

- `T1`, `T2` wait on an auth migration that does not exist.
- `T4` waits on an owner schema decision.
- `T3` is `DEVICE`-only — it needs a person with real hardware, and per §0.3 an agent may never
  mark it.
- `S1` needs content only the owner can supply.
- `N1`, `N2`, `S1`, `S2` each carry a `HUMAN` check, and §10's definition of done requires watching
  a real first-time user complete a session.

**What can realistically be done in a couple of focused sessions:** Stream A (deploy), plus `L2c`,
`L2b`, `L1`, `N1`, `N2`'s focus-ring fix, and most of `S2`. That is a real and visible dent — it
closes Wave 1, most of Wave 2, and the polish sweep.

**A useful definition of "finish" for now:** *deploy shipped, Waves 1 and 2 closed on their `AGENT`
and `BROWSER` checks, `S2` done, and the owner-blocked blocks (`T1`/`T2`/`T4`/`S1`) explicitly
scheduled rather than silently pending.* Wave 3 and the `HUMAN`/`DEVICE` checks are a separate
conversation about people and hardware, not about agent time.

## Suggested next three sessions

**Revised after A1**, whose findings outrank the deploy: three of them are live on production now
and do not wait for a ship.

1. ~~**A1-1 + A1-5**~~ **DONE 2026-08-07** (`1ab40de`, `d6a1e22`), both red-proofed.
2. ~~A1-2~~ **DONE** (`3426186`). **A1-3 remains** ⚑ — its remedy is a product decision (allowlist?
   priority tier? per-IP floor?), not just code, and needs the owner.
3. **A2 + A3 + A4** — CI green, rollback doc, deploy. Unblocks `L1`, `L2` step 2, UX-5.

Then `L2c` + `L2b` + `N1` — three small, independent, high-visibility blocks that close Wave 1's
remainder and start Wave 2.
