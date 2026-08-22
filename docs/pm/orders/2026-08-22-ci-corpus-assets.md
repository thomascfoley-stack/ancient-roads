# Order — CI corpus assets: fetch from the blob store, with a cache

**Filed 2026-08-22 under [ADR-119](../../DECISIONS.md) family 3.** Not started.

## Why this exists

Four DB-backed suites — `draft-check`, `pipeline-to-ready`, `routes`, `search` — are exempt from
the db-invariants skip ceiling because they need `web/public/bible/kjv`, which is gitignored
(`.gitignore:22`) and therefore absent from every CI checkout. **The exemption is honest, not
satisfactory.** Those suites cover anchoring against the real KJV, the end-to-end
upload→parse→embed→searchable claim, the user-corpus HTTP routes, and all three search modes. An
exemption records that they do not run; it does not make any of that covered.

This order exists so the gap stays a planned outcome instead of an accepted absence. AGENTS.md
already documents the same assets being the thing a fresh worktree lacks, with `cp -c` as the local
answer — CI has no local source to clone from.

## Shape

Fetch the assets in the `db-invariants` job from the **public corpus blob store**
(`ancient-paths-corpus`, D3) with a content-addressed cache keyed on a manifest digest, so a warm
run pays a cache restore rather than a download.

**Smallest slice that changes the number:** `web/public/bible/kjv` alone. It is what all four
suites gate on. `commentaries` (~850 MB) is NOT in scope and no suite here needs it.

## Constraints

- **Cost is per-run wall clock.** State the measured cold and warm cost before adopting it; if a
  warm run pays more than ~30s, say so and let the owner rule again.
- **Fail closed, and keep the honest skip.** If the fetch fails, the suites must still
  `announceSkip` with kind `artifact` rather than failing on a missing file — a flaky asset fetch
  must not become a red that means nothing.
- **The exemption comes out when the suites run**, not before. Removing it while the fetch is
  unproven would re-create the counting problem ADR-119 just fixed.
- Depends on **D3** (the public blob store write credential) being settled.

## Definition of done

The four suites EXECUTE in `db-invariants`, their manifest entries disappear because nothing is
missing, and the run summary's exempt list shrinks by four — measured on a real run, not asserted.
