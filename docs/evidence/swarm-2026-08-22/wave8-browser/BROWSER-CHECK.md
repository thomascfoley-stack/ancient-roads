# Wave 8 browser check — integrated candidate (2026-08-23)

Dev server: `next dev` from the candidate worktree (`swarm/closeout-2026-08-22`), port 3004,
against the dev DB. Checked by the Wave-7/8 verifier session (wrote none of the swarm UI code).

## Executed

| surface | width | result |
|---|---|---|
| `/` (marketing) | 1280 | renders, interactive elements present, no overflow |
| `/read/john/1` | 1280 | renders (alias → /read/jhn/1 works), h1 "John 1", **no horizontal overflow** |
| `/read/john/1` | 375 | renders clean — header controls, explainer card, bottom nav; **no horizontal overflow** (scrollWidth 375 = viewport) |
| verse tap (real interaction) | 375 | verse number tap → annotation sheet opens: John 1:1, **Commentaries 15**, Chrysostom (patristic, 390) rendering attributed full text, "Sign in to highlight" prompt. The product's core loop, exercised on the candidate |
| `/desk` | 1280 | shell renders, no overflow; desk STATE stuck on "Loading your desk…" — per-account 401s signed-out (expected) |

## Console

Clean except: (1) React dev-mode eval() notice — the browser pane's CSP against Next dev, not
the app; (2) expected 401s on per-account endpoints signed-out; (3) `/api/auth/get-session` 500.

## The 500 and the /ask crash — pre-existing local posture, NOT the candidate

`NEON_AUTH_BASE_URL is not set` (neon-auth.ts:23). The main tree has the identical gap (its
web/.env.local carries only APP_DATABASE_URL + DEEPINFRA_API_KEY), and the candidate touched
neither `ask/page.tsx` nor `session.ts` (diff vs merge-base: empty). Local dev has not had
working auth since the C5 cutover; every prior walk (A7/A7b) exercised auth surfaces against
production. **Auth-gated surfaces (plans toggle, My Works upload sentence, history citation)
are therefore walked on PRODUCTION after deploy, as A7b did** — their component-level behavior
is covered by the merged suites (L2TOGGLE 4 legs incl. dual-theme, my-works conjunction test,
history-citation-provenance 74-line suite, UX3 267 tests).

## NOT checked here (honest)

- Signed-in flows (sign-in requires credentials this agent must not enter).
- Dark mode at both widths (component suites assert dual-theme classes; a human look on prod
  is listed in the deploy follow-ups).
