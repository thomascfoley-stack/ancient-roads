# Red-proof — the A3/A4/§4 publish-flip toolchain

Built to the spec in [the readiness order](../../pm/orders/2026-08-01-a3-a6-readiness.md). Every
case below was **watched fail** (or refuse) and then pass, against a throwaway local PostgreSQL 15
on `127.0.0.1:55444` with a hand-transcribed schema subset — the same precedent the Stage 2 and A1
audits used. **No production connection of any kind. No Neon endpoint touched.**

Fixtures: 4 sources (`calvin-institutes`, `spurgeon-sermons`, `olney-hymns`, and
`bystander-work`, which no slug list ever names), one clean section each.

## `scripts/publish-flip.mjs` — the A4 writer

Guard refusals (no database touched; hosts are `.invalid` so even a bug cannot reach anything):

| # | seed | result |
|---|---|---|
| 1 | localhost URL without `--local-redproof` | STOP: local path is red-proof only |
| 2 | prod-shaped host, no `PUBLISH_ALLOW` | STOP: requires explicit override |
| 3 | prod-shaped host, allow but wrong `PUBLISH_EXPECT_HOST` | STOP: not the declared endpoint |
| 4 | UPPERCASE prod-shaped host, allow + correct declaration | guard passes (lowercased compare), clean STOP at connect: "Nothing was written" |
| 5 | empty slug list | STOP: A4 has no payload until A3 adjudicates |
| 6 | slug `../etc/passwd` | STOP: not a slug, refusing to guess |
| 13 | `echo publish \|` piped stdin, allow + declared | STOP at the TTY gate, **before any connect** |
| 14 | connected as `app_runtime` | STOP: role asserted at the server, expected `neondb_owner` |

Case 4 originally produced an uncaught `ENOTFOUND` stack; `connect()` is now inside the guard
path and dies scrubbed. Case 13 originally refused at DNS, not at the gate — the TTY check ran
after `connect()`; it now runs before, so a piped stdin never opens a connection. Case 14 was
originally unprovable because the role assert sat behind the `localOk` bypass; it is now
unconditional, which is both stronger and testable.

Database behaviour (each verified by reading `sources` after):

| # | seed | result |
|---|---|---|
| 7 | happy path, 3 slugs | 3 rows `staged→published`; **bystander untouched**; snapshot written before COMMIT |
| 8 | immediate re-run | flips 0, exit 0 — idempotent via `AND status='staged'` |
| 9 | `--reverse` | exactly the 3 named slugs back to `staged`; bystander untouched |
| 10 | licence `All Rights Reserved` on one flipped work | **GATE RED**, rollback, all 4 rows still `staged`, exit 1 |
| 11 | provenance `https://www.biblehub.com/x` (subdomain) | **GATE RED**, rollback, 0 published, exit 1 |
| 12 | `sections.source_url = https://studylight.org/c` | **GATE RED** on the section leg — the leg `publish-works.mjs` never had — rollback, exit 1 |

Exit codes read with `$?` on the bare command, not through a pipeline (a pipeline reports the
last stage's exit — the first reading of case 10 said `EXIT=0` because `tail` succeeded).

## `scripts/publish-flip-adjudicate.mts` — A3

| # | census | result |
|---|---|---|
| A | 2 admitted+staged, 1 not-admitted-but-staged | exit 0; flip list = exactly the 2 admitted; not-admitted excluded, **not** a STOP (it is not published) |
| B | one `published` + `admitted:false` row | **STOP, exit 1, no flip file written** |
| C | host `ep-tiny-hat…` | REFUSED exit 2 — A3 adjudicates production |
| D | cohort `published` | REFUSED exit 2 — the flip already ran |
| E | `sources: []` | REFUSED exit 2 — vacuity guard; every rule would pass over nothing |
| F | a row with no slug | REFUSED exit 2 — refuse rather than guess |

Verdicts come from `admissionFindings`/`censusVerdict` in `scripts/lib/publish-flip-census.mjs`
(already red-proved there), imported, not re-typed. Admission falls back to membership in
`SERVED_PROSE_WORKS ∪ SERVED_LANE_WORKS` imported from the shipped `routing.ts`.

## `scripts/publish-flip-verify.mjs` — the §4 before/after

| # | seed | result |
|---|---|---|
| G | `FLIP_VERIFY_LOCAL_URL` pointing at a prod-shaped host | STOP — the red-proof env var cannot become a side door |
| H | before → flip 3 → after | `diff` shows **exactly** the flip: 3 slug lines change status, per-register counts appear, totals move 4/0→1/3. The bystander appears in neither side of the diff. No timestamp in the body, so the diff is data-only. |

## Residuals, stated

- **The first run against real data will be production.** The fork rehearsal `PUBLISH_FLIP.md`
  §3 calls for cannot happen (Neon branch creation forbidden). Compensations: these proofs, the
  in-transaction gates, the pre-COMMIT snapshot, `--reverse`.
- The snapshot + `--reverse` restore `sources.status` **and nothing downstream** — not a Neon
  restore point. Owner must accept explicitly (readiness order, CANNOT-BE-READY §3).
- The local schema is a hand-transcribed subset (no RLS, no `commentary_entries`, PG15 not
  Neon). SQL valid here can still fail there; the guards proven here are host-independent.
- `ssl: { rejectUnauthorized: true }` on the non-local path has not been exercised against a
  real Neon endpoint by these proofs.
