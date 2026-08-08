# Visual Redesign PRD — Implementation Handover

**Date:** 2026-08-08 (late evening)
**Status:** Implementation complete, styling-only. Build/lint/tests green. NOT yet visually verified in a browser; full `npm run audit` NOT run (env leg refused — no dev DATABASE_URL).
**WORKLOG entry:** top of `WORKLOG.md` (same date) — the session record; this file is the map.

---

## 1. Source material (all outside the repo)

- **PRD (binding spec):** `~/Desktop/App UX Redesign Guide/Ancient_Paths_Visual_Redesign_PRD.md`
- **HTML mockups (exact Tailwind reference per screen):** same folder, `1-AncientPaths - Home.html` … `6-AncientPaths - Journal.html`
- **Screenshots:** same folder (macOS narrow-space filenames). Ask = V3/3 shot; Journal = V2/2; Plans = V1+V2; Library = V1/2.
- PRD §12 has five open questions — decisions were made by default, see §7 below.

## 2. How it was built

Foundation first (hand-edited), then ten parallel subagent scopes, styling-only, no logic/test changes. Committed in two sweeps by a parallel session: `e171de8` (46 files) and `19af904` (13 files), plus `f100ad8` (owner call: Log-in pill) and `48440c4` (WORKLOG).

## 3. Foundation — `web/src/app/globals.css`

Everything else builds on this. If a style looks wrong app-wide, look here first.

| Token | Now means | PRD hex |
|---|---|---|
| `stone-50` | base parchment page bg | `#FBF8F2` |
| `stone-200` | vellum — hairlines, recessed surfaces | `#E7DED0` |
| `stone-500` | ink-wash gray — muted text, metadata | `#6B6156` |
| `stone-800` | night hairline (dark borders) | `#3A322A` |
| `stone-900` | ink black — primary text | `#2B2119` |
| `stone-950` | night surface (dark bg) | `#1A140F` |
| `accent-600` | antique gold (light) — links, verse numbers, focus, progress | `#8A5A2B` |
| `accent-400` | dark-mode gold | `#C4975A` |
| `flame` | candle-flame amber — RARE only (save dot, Ask stage check, verse flash) | `#C97B3A` |
| `era-early/medieval/reformation/modern` | era borders + ornaments · ◆ § — | `#7A3B2E` `#6B5A3A` `#4E5D6B` `#6B6156` |

- **All `--radius-*` tokens = 0.** `rounded-*` classes still in markup are no-ops; `rounded-full` survives for true pills only (swatches, dots, avatar, Log-in pill per owner).
- **All `--shadow-*` tokens render nothing.** Shadows are banned; some classes remain in markup harmlessly.
- `ease-gentle` = `cubic-bezier(0.4, 0, 0.2, 1)`; `animate-slide-up` re-pointed to a fade (PRD bans slides); `animate-fade-in` = 200ms.
- 6px scrollbar (vellum/night thumb); paper grain = inline SVG turbulence data-URI at 2.5% opacity, light mode only (`body::before`, CSP-safe).
- **Fonts unchanged** (already correct): EB Garamond = `font-display`, Literata = `font-serif`/`font-scripture`, Source Sans 3 = `font-sans`; self-hosted via next/font in `layout.tsx` (the `--font-*-face` composition is load-bearing — see the long comment in layout.tsx).

### Two cascade gotchas every future editor must know
1. **`.edge` is unlayered CSS** and beats ANY layered Tailwind `border-*`/`focus:border-*` utility (measured bug, documented in globals.css). Consequences: focus states use the global 2px antique-gold `:focus-visible` OUTLINE, not a focus border; hairlines on vellum surfaces (sidebar rail, commentary sheet) can't use `.edge` (vellum-on-vellum invisible) and use `border-stone-500/25` or parchment-on-vellum pairs instead — commented in place.
2. **`border-X dark:border-Y` pairs lose the cascade** for border-color in this app — that's why `.edge` exists. Don't add new ones for hairlines; single-class translucent colors or `.edge` only.

## 4. Scope-by-scope: what changed and where

### App shell & navigation
`components/app-shell.tsx`, `sidebar.tsx`, `mobile-nav.tsx`, `reader-header.tsx`, `chapter-nav.tsx`
- Sidebar rail = recessed vellum (`stone-200` light / `stone-900` dark); wordmark EB Garamond 18px; nav links are text-only (ink-wash → ink hover, active = ink + label underline); scrims = PRD exact `stone-950/[0.32]` light / `stone-50/[0.08]` dark; blur removed everywhere; prev/next chapter = hairline-bordered squares with instant ink-fill hover.

### Reader
`app/read/[book]/[chapter]/page.tsx`, `components/verse-display.tsx`, `passage-view.tsx`, `reader-settings.tsx`, `selection-popover.tsx`, `verse-ref.tsx`, `book-picker.tsx`
- Bare 66ch column (card chrome deleted), 30px display chapter title + full-width hairline, body 18px Literata `leading-[1.9]`.
- **Drop cap is CSS-only `::first-letter`** on the first verse (4.8rem EB Garamond, gold, `onum`) — deliberately no DOM change because the offset-anchoring engine requires text nodes to concatenate to exactly `v.text`. Screen readers unaffected.
- Verse numbers 11px Source Sans gold `onum`; selected verse = vellum flash (the deep-link flash ring stays `ring-2` — locked by `test/invariants/verse-deep-link.test.tsx:83`, only the color changed to `ring-flame/70`).
- Selection popover: night-surface pill, 1px `stone-800` border, no shadow, 28px circular swatches, 150ms fade; **inverts to parchment in dark mode** (PRD §8) with paired inner-control colors. Context label is `stone-400` on the dark pill because literal ink-wash measured 3.6:1 (below AA) — commented.

### Commentary, study, desk
`components/commentary-panel.tsx`, `study-panel.tsx`, `word-panel.tsx`, `interlinear.tsx`, `define-sheet.tsx`, `desk-pane.tsx`, `passage-pane.tsx`, `app/desk/page.tsx`
- `EntryCard` owns the era treatment: 3px era left border (no dark flip, PRD §8), ornament after author in ink-wash (brief/mockup beat PRD §4's era-color ornament — noted), quote 17px Literata 1.75 at 62ch, "Read more" 12px uppercase gold. Era comes from an `eraOf(year)` helper; unknown era → neutral `stone-500/40` fallback.
- Commentary sheet surface = vellum light / `stone-900` dark; hairlines on it use `stone-500/25` (see gotcha 1).
- Word study: Greek/Hebrew headwords stay in `font-scripture` NOT EB Garamond (no Hebrew glyphs in the display face — commented); English define-sheet word gets `font-display` 22px.

### Ask
`components/ask-client.tsx`
- Square parchment composer (focus = gold outline via `focus-within`, because `.edge` eats focus borders — commented); stage checks `text-flame`; **spinner replaced with an opacity-pulsing gold ring** (PRD bans spinners); staggered fade reveal (framing → voices 60ms stagger → lanes → passages) via `animationDelay` + `fill-mode backwards`; voice cards era-bordered; passages = hairline rows with gold refs.
- **Deliberately missing:** the PRD's 17px passage preview text — `passages` carry only verse-id ranges, no text; fetching text is a data change, out of styling scope (commented in file).

### Prayers
`components/prayer-journal.tsx`
- Unstyled hairline list (dates small-caps ink-wash above 18px Literata first lines), 66ch, no chrome. **Signature save-dot:** 6px `bg-flame` dot beside the date, 150ms fade in → 2s hold → fade out; needs the new prayer's id, so `write()` now parses the POST response body (the ONLY logic touched in the whole redesign). Compose = parchment hairline textarea; save/cancel kept explicit (mockup's blur-save is a behavior change, not done).

### Plans
`components/plans-client.tsx`
- Hairline rows with gold-hover titles; progress bar 2px vellum track / 2px gold fill, square ends; builder labels 12px uppercase 0.08em ink-wash, hairline inputs; schedule = hairline days with small-caps dates and gold Literata refs. `PRIMARY_BUTTON` const = the house hairline-CTA idiom (same as today-view).

### Home / devotional
`components/today-view.tsx`, `suggested-readings.tsx`
- Small-caps 0.3em date, 120px centered rule, 36px display title; verse blockquote 3px gold left border; Voices heading 22px small-caps 0.08em; entries get era treatment from `EntryCard` (commentary-panel, above); CTA = hairline button with INSTANT hover fill (no transition, PRD §7). Attribution moved into the lection line (Spurgeon entries have no title — noted in file).

### Library & works
`app/library/**` (hub, `[catalog]`, word-study, passages, notes), `app/work/[slug]/page.tsx`, `components/catalog-search.tsx`, `my-works.tsx`, `work-reader.tsx`, `work-header.tsx`, `work-section.tsx`, `work-toc.tsx`, `work-beside-tradition.tsx`
- Hairline-separated rows everywhere (cards deleted); shelf names 22px display; right-aligned 11px tabular counts; My Works 18px Literata titles + 14px ink-wash metadata; work-reader's "page card" removed so text sits on the parchment page. Era borders deliberately NOT added to passage-search results (PRD doesn't ask; that's the commentary panel's idiom).

### Marketing / landing / public
`app/page.tsx`, `features/page.tsx`, `why/page.tsx`, `about/page.tsx`, `gate/page.tsx`, `components/marketing/nav.tsx`, `marketing/footer.tsx`, `waitlist-form.tsx`, `coming-soon.tsx`
- Sage palette retired from use → parchment/ink/antique-gold. Hero scrims REMOVED; type on a parchment band at hero bottom; headline 40/56/72px EB Garamond; feature rows = hairline-separated type blocks. `marketing/nav.tsx` lost the `onDark` prop (never over imagery now); the Log-in button is a pill per owner call (`f100ad8`). The night "Built to never interpret Scripture" band kept as the one full-bleed dark flip.

### Auth, settings, misc
`components/auth-forms.tsx`, `account-settings.tsx`, `app/settings/**`, `app/auth/[path]/page.tsx`, `omnibox.tsx`, `app/error.tsx`, `not-found.tsx`
- PRD buttons (hairline ink, instant fill; secondary ink-wash), inputs parchment + hairline with gold outline focus, labels 12px uppercase, modals/scrims per PRD, error/404 = quiet editorial columns.
- **Known broken (pre-existing, flagged):** omnibox's `focus-within:border-accent-500` can't paint (gotcha 1) — the fix belongs in globals.css.

## 5. Verification evidence

- `cd web && npm run build` — PASSED, 41 routes (4 warnings pre-existing: pdfjs-dist external, bible-index file patterns).
- `cd web && npm run lint` — 0 errors, 20 warnings ALL pre-existing (unused vars etc.).
- `cd web && npm test` — **694 passed / 0 failed** (104 files; 25 suites skip, DB legs).
- Each scope agent ran its own targeted suites — all green (sidebar-catalog-nav, verse-deep-link, selection-popover-layout, s2-era-accent, s2-polish, plans-*, catalog-*, prayer-*, settings-and-auth-routes, etc.).

## 6. NOT DONE / UNVERIFIED (the handover list)

1. **Browser visual pass — the big one.** Nothing has been SEEN. Check in both themes: drop cap on `/read/psa/23`, selection popover dark-mode inversion, grain visibility, hover fills, Ask stagger, prayer save-dot, mobile sheet fades. `cd web && npm run dev`.
2. **`npm run audit` refused** at its env leg (no dev DATABASE_URL in root `.env.local`). Full audit still owed; only DB-free legs are green.
3. **Sage tokens + `--shadow-card`** still declared in globals.css but unreferenced — safe to delete in a follow-up sweep (verify with grep first).
4. **Ask passage previews** (17px Literata preview lines) need verse text fetched for passage ranges — a data change, deliberately deferred.
5. **Omnibox container-focus** silently dead (see §4 Auth) — fix in globals.css (e.g. an unlayered `.edge-focus` rule).
6. **PRD §12 owner questions** — shipped defaults: drop caps at EVERY chapter opening (not just books); commentary cards keep existing expand behavior; prayer journal stays chronological (no tags); Ask composer limit unchanged; multi-era authors = `eraOf(year)` single era.
7. OG/social cards predate the new brand (carried over from the previous session's list).
8. `stash@{0}` ("WIP on main: e2747ff…") predates this session — not ours, left alone.

## 7. Repo rules that bite (read before continuing)

- `npm run audit` is the definition of green — it refused here; do not claim done on build+tests alone.
- **One agent session per working tree** — deploy.sh gates on a clean tree; any stray file blocks deploys.
- Deploy = `deploy.sh` only; Vercel does not deploy on push. Anything touching prod (`ep-odd-fog`) needs the owner's explicit go.
- Tests lock presentation details in places (flash ring `ring-2`, tradition chip class prefix, work-section text-node invariant, popover mobile flex-wrap) — if a styling change reds a test, revert the styling, never edit the test.
