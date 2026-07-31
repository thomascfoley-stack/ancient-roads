# Tranche 5 — front-matter stash branch evaluation (2026-07-31)

Branch `wip/front-matter-strength` pushed from `stash@{0}` (`concurrent-worker-front-matter-wip`).

## Gating question: STOP on admittedStrongHits vs all admitted hits?

**At `b4596aa` on stage2:** front-matter scan STOPs on **all 8 admitted hits** (apparatus-title class).
Strength is computed (`strong` vs `weak` via `labelStrength` / `BOOKISH_SCOPE_RE`) but **does not gate**.

**Stash branch merit:** gating only `admittedStrongHits` would allow the build to pass while still
serving weak apparatus (e.g. Philip Schaff "The Argument for the Immaculate Conception" at Gen 3:15 —
genuine scholarship keyed to an apt verse). That is **more correct** than stopping on weak hits.

**Recommendation:** if gating is desired, STOP on **strong only**; keep weak hits as warnings for
human review (ADR-029: detection ≠ deletion). Stopping on all admitted hits (current stage2) is
conservative but blocks on two false positives documented in `front-matter-detector.mjs` header.

## Weak-hit list (from `static-corpus-scan.log`, held — not admitted)

| Work | Verse key | First 80 chars | Reasoning |
|------|-----------|------------------|-----------|
| Keil & Delitzsch | 26:38:1 (Ezek 38:1) | Introduction | apparatus-title but scope does not name a book/edition → **weak** |
| Keil & Delitzsch | 26:40:1 (Ezek 40:1) | Introduction | same |

## Admitted hits (8) — all **strong** at b4596aa

| Work | Verse key | First 80 chars | Apparatus vs content |
|------|-----------|------------------|----------------------|
| John Chrysostom | 44:18:10 (Acts 18:10) | Argument. | apparatus-title; book scope → strong |
| Philip Schaff | 1:3:15 (Gen 3:15) | The Argument for the Immaculate Conception. | weak by detector rules (subject not book) — **still admitted** at b4596aa |
| John Flavel | 58:3:11 (Heb 3:11) | The Epistle Dedicatory | strong |
| John Owen | 40:16:14 (Rom 16:14) | The Preface | strong |
| Thomas Watson | 40:6:9 (Rom 6:9) | The Preface to the Lord's Prayer | weak (subject = prayer content) — **still admitted** at b4596aa |
| John Chrysostom | 50:1:7 (Phil 1:7) | The Argument | strong |
| John Chrysostom | 45:11:13 (Rom 11:13) | Argument. | strong |
| John Flavel | 45:12:3 (Rom 12:3) | The Preface | strong |

## Known-good: "Preface to the Gospel of John" at John 1:1

Verified via `test/front-matter-detector.test.ts` and `scripts/lib/front-matter-detector.mjs`:
- Title line matches label + bookish scope (`to the Gospel of John`)
- `classifyFrontMatter` → **strong** apparatus
- Red-proof in `docs/evidence/work-order-v2-tranche5/front-matter-redproof.log` (seed MAX_TITLE_CHARS, revert)

**Do not merge** stash branch to stage2 without owner review of gating policy.
