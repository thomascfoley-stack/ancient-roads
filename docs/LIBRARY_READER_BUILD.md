# BUILD ORDER — Book Reader + Annotation Engine + Library

**This is the work order. The design of record is [`docs/LIBRARY_READER_DESIGN.md`](LIBRARY_READER_DESIGN.md) — read it in full first; it is the *what* and *why*. This file is the *how to build it safely*: sequencing, the agent team, the checks, and the definition of done.** Where the two ever disagree, the design doc wins on intent and this file wins on process.

You are running a small agent team under loop-engineering discipline (`docs/THE_LOOP.md`, the `quality-slice` / `false-confidence-audit` / `deep-audit` skills, `CLAUDE.md`). Nothing here overrides `CLAUDE.md` — it inherits every gate.

---

## 0. Mission & the locked decisions

Build one system with three faces — a **work-anchored Book Reader**, a **shared annotation engine** (highlight/note/bookmark), and a **personal Library** — plus the nav/IA that surfaces the corpus. The design doc §§1–10 is the spec. These owner decisions are **settled — do not re-open them** (design doc §7a):

1. **Foundation first.** Annotation engine + Logos highlighter into the *existing* Bible reader → then Book Reader → then Library hub + catalogs.
2. **Calm & immersive, matching today's app.** Same paper/serif/chrome. Reading clean by default; tools on demand. **Mobile-first (390px is first-class).** Mockups are direction, not a pixel contract.
3. **Separate sections; "Hymns & Poetry."** Commentaries · Sermons · Hymns & Poetry · Word Study. Poems+hymns one section, Hymns/Poetry sub-filter. ("Music" dropped.)
4. **Logos-style, in our skin.** Our colors/type/spacing, not a clone. **Tap-verse → commentaries is untouched.**

### Hard boundaries (violating any of these is a STOP)
- **Agents build and verify; the owner runs the prod deploy.** All four build phases happen on the dev branch. Production ships in **Phase 5 (§2)** as the eyes-open, owner-run cutover — gated by a clean `deep-audit` and the owner applying migrations. Agents never autonomously push the real prod `web` project (→ ancientpaths.app); that step is the owner at the keyboard (`CLAUDE.md`: "publish = hard human gate"; "after ANY long autonomous agent run, run `deep-audit`"; irreversible prod steps require owner presence).
- **Do not change tap-a-verse → commentaries.** The existing Bible reading path stays byte-behavior-identical.
- **Do not touch the verifier / contract / teacher-prompt core** except through the byte-sync guard (`test/web-core-sync.test.ts`, `test/bible-sync.test.ts`) — if you change one copy you copy it to the other, or the guard goes red (intended).
- **Migrations are owner-run.** Agents *write* migration SQL and its red-first test; the owner *applies* it (dev branch) and confirms. No agent runs a migration against a shared DB. No destructive/branch-promote operation.
- **No `any`. No secrets in output. No unbounded result sets** (every work/section/search query is keyset-paginated or `LIMIT`ed — Calvin's *Institutes* and a 3,560-sermon collection must never be one response).
- **Previously-open decisions are now settled (do not re-open):** (1) `sections` reading-unit → build the durable **`sections.unit_ordinal`** grouping column (**ADR-026**); (2) drift → pin **`source_content_hash`**, degrade to a section-level indicator on mismatch, never a corrupt span, never silent drop (**ADR-027**). Both are owner-run migrations, red-first.

---

## 1. The team & anti-race discipline

Concurrent writers have bitten this repo twice. Enforce:
- **PM (integrator) — one, serial.** Only the PM merges. Agents deliver on **non-overlapping worktrees**; the PM integrates one branch at a time, runs the gate, then takes the next. Never two agents editing the same file.
- **One writer per file.** Partition by file/dir up front. If two tasks need the same file, they are one task or they are serialized.
- **Fresh checker ≠ author, fresh tester ≠ author.** An agent may not certify its own output (`THE_LOOP` rule 6). The `deep-audit` at the end uses agents that did not write the code.
- **Coding agents** take one phase-slice each, sized to a single vertical slice (prove deep before wide).

---

## 2. Sequencing — four phases, each a full loop, each shippable

Each phase: frame the falsifiable check first → build the smallest honest slice → **watch the check go red on a broken input, then green** → load it in a browser at **390px AND desktop** (real interaction, no console errors, no overflow) → `npm run audit` green → `/audit` + (data/auth) `/security` → write `WORKLOG.md` + update `ROADMAP.md` → **STOP at the DoD.** No phase opens the next until it is Done, not "typechecks."

### Phase 1 — Shared annotation engine + Logos highlighter (into the *existing* Bible reader)
The foundation. No new reader yet; the win lands in the reader you already ship.
- Extract **`useTextAnnotation(rootRef, resolveTarget)`** from `verse-display.tsx` (design §3). Rename `rangeToVerseOffsets → rangeToOffsetsInContainer` (already generic). **Keep byte-sync** src/↔web/.
- Build the **Logos-style selection popover ONCE** against `pending` state, mounted by `VerseDisplay` now (mockup §10.1): color swatches (existing app colors) · Add note · Bookmark · Ask Ancient Paths · Copy styled/lines/text · context label `Author · Work · locus` (never a host URL). Portal + collision-aware (`HIGHLIGHTER_POLISH.md`); mobile docked-low bar.
- **Red-first check:** a test that a selection spanning multiple text nodes persists the exact `sections.body`/verse substring (seed an off-by-one, watch it fail). The overlap/segment-flatten invariant must hold.
- **DoD:** verse highlight/note works *exactly as today* (regression-guarded) **plus** the new popover; tap-verse→commentaries unchanged; browser-verified both widths.

### Phase 2 — Book Reader (`/work/[slug]`) + DB-served sections
- `GET /api/work/[slug]` (source + TOC: `id, ordinal, heading`, no bodies) and `GET /api/work/[slug]/sections?after={ordinal}&limit=N` (bodies). **Keyset-paginated, `status='published'` filtered, never unbounded.**
- `WorkReader` (windowed/virtualized body) · `WorkToc` drawer · `WorkHeader` (title/author/tradition/license — **never a host URL**) · resume (`{slug, ordinal, scroll%}`). Reuse `reader-settings`, `StudyPanel` shell, docked bar. Calm/immersive per §7a.2.
- **Mount the Phase-1 popover here too** (`resolveTarget` walks to `dataset.sectionText`). The section container's text nodes must concat to exactly `sections.body` (offset invariant, design §3).
- **Reading-unit decision applies here** — escalate before Spurgeon-scale (§0). MVP may collapse consecutive same-title chunks; flag the durable `unit_ordinal` call.
- **Red-first check:** paginate a large work (Institutes) — assert no unbounded response, ordering stable, resume returns to the right ordinal. **DoD:** read a real work end-to-end, highlight inside it, both widths, audited.

### Phase 3 — Data model (migrations, owner-run) for polymorphic anchoring
Design §4. Agents author SQL + red-first tests; **owner applies on dev.**
- **MIG-A** polymorphic `highlights`+`notes` (`target_kind`/`section_id`/`source_content_hash`, drop `verse_id NOT NULL`, XOR CHECK, **notes unique index → verse-only** so section notes are many-per-section, backfill existing → `target_kind='verse'`). *The data-shape-risk one — seed a bad row, prove the CHECK rejects it.*
- **MIG-B** `bookmarks` · **MIG-C** `library_items` (`shelf ∈ reading/saved/archived`, don't overload `user_library`) · **MIG-D** `reading_progress` · **MIG-E** `tags`+`annotation_tags`.
- Identical RLS block on every new table; **no new GRANT**. **Verify RLS with two accounts, not by reading policy** (`/security`).

### Phase 4 — Library hub + corpus catalogs + search
- `/library` hub (mockup §10.3): **Continue reading · Yours** (My Library · Notes · Highlights · Bookmarks · Save for later · Tags) **· The corpus** (catalog chips). Fills the named gaps (My Library, Continue Reading, Bookmarks, Tags).
- Catalogs (mockup §10.2): **Commentaries · Sermons · Hymns & Poetry** (Hymns/Poetry sub-filter) — work lists, facets, **search-within-type**; each work opens in the Book Reader. Nav gains the "Read" + "You" groups (`sidebar.tsx`/`mobile-nav.tsx` idiom, no rail bloat).
- `searchSections({query, sourceType?, sourceId?, tradition?, limit, offset})` on the `commentary-search.ts` pattern (`ts_headline`, capped count, keyset paging); **dedupe chunks to reading-units**; `GET /api/search/works`.
- **Red-first check:** search returns paged/deduped results, RLS-scoped "from your library" rows never leak across accounts. **DoD:** browse → search → open → read → highlight → see it in Library, both widths, audited.

### Phase 5 — Production cutover (eyes-open, owner-run)
The whole system ships here. This phase is **not** autonomous — it is the owner-run, eyes-open procedure, because it is irreversible-adjacent (RLS data isolation on a live product, licensing, a public surface).
1. **`deep-audit` first** (required after a long autonomous run and before any prod deploy): a fresh parallel sweep — attack surface · data layer · the annotation offset invariant · **RLS proven with two live accounts** · client at 390px + desktop · docs-vs-reality · Gate B licensing. **An agent may not audit its own output.** Any finding that could serve a wrong/unsafe/leaking state is a STOP — fix on dev, re-audit, do not deploy red.
2. **Owner applies the migrations (MIG-A..E + `unit_ordinal`)** on the prod DB, in order, each already proven red-first on dev. Additive/idempotent; no destructive or branch-promote step.
3. **Owner runs the deploy** — the standing eyes-open procedure (`deploy.sh` → predeploy licensing ratchet → build → working-tree upload to the **`web`** project). Not a git push; not a Neon branch-promote (would wipe user data).
4. **Post-deploy smoke on prod:** open a real work, make a highlight, reload and confirm it persisted, confirm a second account can't see it, no console errors at both widths. Record the cutover in `WORKLOG.md`; log any deferred item in `docs/DECISIONS.md`.

**Why this isn't wired as auto-push:** the product is live, RLS is the only thing standing between users' private notes, and a licensing/prod mistake isn't "revert the commit" — it's exposure. `CLAUDE.md` makes publish a hard human gate and requires `deep-audit` after exactly this kind of long autonomous run. The four build phases *are* fully autonomous on dev; the last inch to prod is the owner, deliberately.

---

## 3. Definition of Done (per phase AND overall) — strict

A phase is Done only when: built **AND** a check that could have failed was watched red→green **AND** loaded in a browser at **390px and desktop** (looked at, a real interaction exercised, no overflow/overlap, no console errors) **AND** `npm run audit` green **AND** `/audit` clean **AND** (data/auth paths) `/security` + **RLS proven with two accounts in dev** **AND** byte-sync guards green **AND** `WORKLOG.md`/`ROADMAP.md` updated, owner decisions in `docs/DECISIONS.md`. "It typechecks" is not "it runs." A screenshot is not optional.

**Overall, before calling the system done:** run the **`deep-audit`** skill (parallel agents, non-overlapping lenses, none auditing their own output) across attack surface · data layer · annotation invariant · RLS · client · docs-vs-reality. An open loop with no check is where slop enters — every phase ends at a named STOP.

---

## 4. First move

Confirm go-live has shipped (there must be live works to read). Then PM: read the design doc end to end, partition Phase 1 by file, spin the coding agent(s) + a fresh checker, and run Phase 1 to its DoD before opening Phase 2. Escalate the two open owner decisions (§0) when Phase 2/3 reach them.
