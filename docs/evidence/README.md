# Evidence — the artifact trail for DoD claims

**Rule (2026-07-19, owner-directed): every "verified / proven / passed" claim names its artifact.**
A claim without an artifact is reported **UNVERIFIED**, not asserted. No exceptions, including for
the owner.

## Why this exists

`CLAUDE.md` has always required "a screenshot is not optional" for any UI change. An audit on
2026-07-19 found **zero durable screenshot artifacts in the repo**. Every browser-DoD claim to that
date was session-only: an agent looked at an image inside its own transcript, asserted "verified at
390px and desktop", and nothing survived that anyone could re-open or check. That is
indistinguishable from not having looked. This directory is the fix.

## What counts as an artifact

| Claim type | Artifact |
|---|---|
| UI / browser DoD | a committed PNG in `docs/evidence/<phase>/`, at 390px **and** desktop |
| A command passed | the command line **and its exit code** (and the tail of its output) |
| A DB/data claim | the **query** and the **row counts** it returned |
| A test proves X | the test path **and** the watched red→green transition |

## Capturing a screenshot

```
node scripts/capture-evidence.mjs <phase> <label> <width> <height> <url> [--mobile] [--scheme=light|dark] [--settle=ms]
```

Two things that script does on purpose, because getting them wrong produces a *misleading*
artifact — worse than none:

1. **It drives the DevTools Protocol, not `chrome --screenshot`.** Headless Chrome clamps its
   window to ~500px wide, so `--window-size=390,844` silently lays out at 500px and CROPS to 390.
   That produces a "mobile" screenshot showing text running off the edge — which reads as a
   horizontal-overflow bug that does not exist. Verified on Chrome 150: `--window-size=390` reports
   `innerWidth` **500**, and `--force-device-scale-factor` does not change the CSS viewport.
   `Emulation.setDeviceMetricsOverride` is the only way to get a true 390 CSS-px viewport.
2. **It asserts the viewport it got equals the viewport it asked for**, and exits non-zero
   otherwise. That is the check that could fail; without it the script would happily write a
   convincing lie.

It also pins `prefers-color-scheme` (headless defaults to **dark**), so captures are reproducible
rather than dependent on a browser default. Zero dependencies: system Chrome + Node 22's global
`WebSocket`. No playwright/puppeteer devDependency, no ~100MB browser download.

## Retroactive status

- **Phase 2 (Book Reader)** — re-captured 2026-07-19, artifacts present in `phase2/`.
- **Phase 3 (annotation migrations)** — no UI surface; evidence is command output + query results
  in `phase3/`.
- **Everything before Phase 2** — browser claims are **UNVERIFIED**. Re-capturing them was not
  cheap (they predate this tree's current state), so the honest label is UNVERIFIED rather than a
  re-asserted claim.
