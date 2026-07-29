# Book Reader + Annotation + Library — design of record

**Status:** design (not built). Sequenced AFTER go-live (the corpus must be live to read it). One coherent system, three faces: a **work-anchored book reader**, a **shared annotation engine** (highlight / note / bookmark), and a **personal library**. Plus the navigation/IA to actually *surface* the corpus content (commentaries, sermons, poetry, hymns) — which the app doesn't do today.

Synthesized from three grounded design passes (data model + flows · reader/annotation tech · library IA/UX), all cited to real code.

## The thesis

Today there is **one reader** (the Bible: verse-anchored — tap a verse → the voices on it). You ingested 3,560 Spurgeon sermons, Calvin's *Institutes*, the poems — but there is **nowhere to read a whole work**, and the nav doesn't even surface them. The Bible reader shows a *snippet on a verse*; the book reader is where you *sit down and read Calvin start to finish, and study in it.* That second reader is what makes the corpus valuable as reading material, not just as verse-glimpses.

**The unifying insight:** the book reader, the Logos-style highlighter, and the library are **one system, not three.** An annotation anchors to *either* a verse (Bible) *or* a section+offset (a work); the library is where those annotations and saved works surface. Build the annotation engine once, it serves everywhere.

## 1. Navigation & IA — surface the corpus, then the library

Today the nav is just **Bible · Ancient Paths · Home** (`sidebar.tsx:99-106`, `mobile-nav.tsx`). The corpus content types are invisible. The IA gets two tiers:

**A. The corpus catalogs (discover + browse + search + open):** each content type is a browsable, searchable catalog whose works open in the Book Reader.
- **Commentaries** — (the current `/library/commentaries` browse becomes a catalog that can *open whole works*, not just a verse-dropdown).
- **Sermons** — new catalog (Spurgeon, Maclaren, the Puritans, the fathers' homilies).
- **Hymns & Poetry** — the "Music"/verse register grouped into one catalog; inside, sub-filter **Hymns** vs **Poetry** (your "map as music, then look up by poems and hymns"). *(Naming: "Hymns & Poetry" reads truer than "Music" since poems aren't sung — flag for your call.)*
- *(Theology / Historians — grouped as "Church History & Theology," or folded under a general "Works" catalog; staged historians stay staged.)*
- Each catalog: a work list (author · title · tradition · era), facets (tradition/era/author), and **search within that type** — reusing the `commentary-search.ts` FTS pattern (`websearch_to_tsquery` + `ts_headline` snippets + capped count + paging).

**B. The Library (personal — everything you made or kept):** promote **Library** to a real hub (`/library`) with two halves — **MINE** and **THE CORPUS** — rather than pointing straight at one page.
- **MINE:** My Library (bookshelf of works you added) · **Continue Reading** (resume, both readers) · **Notes** · **Highlights** · **Bookmarks** · **Save For Later** (a queued *work*, distinct from a bookmarked *spot*) · **Tags/Topics** (cross-cut notes+highlights by theme).
- **THE CORPUS:** the catalogs above + Word Study.
- Parked: **My Sermons/Uploads** (your own content — the moat) · **Collections/Reading Plans**.

Nav stays lean: the rail/tab points at the `/library` hub and the catalogs; the hub owns the finer sections as tabs/cards (no rail bloat — `sidebar.tsx` idiom).

## 2. The Book Reader (the new surface)

New route `web/src/app/work/[slug]/page.tsx` (deep-link `#s{ordinal}`). **The Bible reader and verse-click→commentaries are untouched.**

- **Served from the DB, not static.** The Bible is static JSON; corpus sections live in Postgres. Add `GET /api/work/[slug]` (source row + TOC: `sections.id, ordinal, heading` — no bodies) and `GET /api/work/[slug]/sections?after={ordinal}&limit=N` (bodies). **Keyset-paginated, never unbounded** (Calvin's *Institutes* / a 3,560-sermon collection must never be one response) — `UNIQUE(source_id, ordinal)` + `sections_source_idx` make it an index range scan.
- **Windowed infinite-scroll** (virtualized: render visible sections ± overscan), a **TOC drawer** (headings), a **progress rail**, and **resume** (persist `{slug, ordinal, scroll%}`; a "Continue Reading" card reads it back).
- **Reuse:** `reader-settings` (font/dark), the `StudyPanel` bottom-sheet shell + `useDragDismiss`, the docked action-bar markup. **Build:** `WorkReader` (windowed body), `WorkToc`, `WorkHeader` (title/author/tradition/license — never a host URL), `WorkNav`, and the per-type catalog pages (the `/library/commentaries` browse UI is a ready template).
- **★ Sections are a *retrieval* unit, not a *reading* unit** (`sermon-lane:ingest-sermon.ts` chunks a work into embedding-sized `sections` with headings like `"TITLE — ref (1/3)"`). The reader reconstructs a readable work by ordering a source's sections; for MVP, collapse consecutive same-title chunks into one reading unit. The durable fix is a first-class `sections.unit_ordinal` grouping column **before Spurgeon-scale works ship** — a logged decision.

## 3. The shared annotation engine (one engine, two surfaces)

The anchor math is *already generic* (`highlight-range.ts` — `offsetInVerse`/`rangeToOffsets`/`snapToWords`/`flattenToSegments` take a text string + node piece-lengths; only one function touches the DOM). So:
- **Extract `useTextAnnotation(rootRef, resolveTarget)`** from `verse-display.tsx:55-107`: the same selection→snap→pending→persist logic, with `resolveTarget(node)` walking up to `dataset.verseText` **or** a new `dataset.sectionText` and returning `{kind, key, textLen, container}`. Rename `rangeToVerseOffsets → rangeToOffsetsInContainer` (already verse-agnostic; the name is the only coupling).
- **The offset invariant generalizes byte-for-byte:** a section's container text nodes must concat to exactly `sections.body` — so a section renders through the *same* `flattenToSegments` path (segment-flatten, never string-splice — the overlap-corruption fix is inherited free).
- **The Logos-style selection popover is built ONCE** against `useTextAnnotation`'s `pending` state and mounted by *both* `VerseDisplay` and `WorkReader` — color + text-color swatches, **Copy Styled / Lines / Text**, Add note, Bookmark, "Ask Ancient Paths." Per `HIGHLIGHTER_POLISH.md`: portal + collision-aware positioning (Floating UI). On mobile keep the docked-low bar so it never fights the OS copy callout. **This is the concrete interlock: the highlighter rebuild you want IS this shared engine — doing it does both surfaces at once.**
- **Coexists with hover-definitions.** Per-word tokenization (for the Greek/Hebrew hover) and highlighting reconcile *because the anchor math already sums across arbitrary text nodes* — the rule: tokenization may split text nodes freely but must never insert or drop a character. Annotation and hover then compose as two independent renderers over one invariant substring set.

## 4. Data model — reuse + additive

**Reused as-is:** `sources`/`sections`/`ordinal`/`section_anchors` (006); the `runAsUser` + RLS pattern (`user_id = current_setting('app.current_user_id')`); `highlight-range.ts` core; the `span_start`/`span_end`/`translation` columns (015); keyset indexes; canonical `verse_id`.

**The polymorphic annotation spine** (applied to `highlights`, `notes`, and new `bookmarks`):
```
target_kind TEXT CHECK (target_kind IN ('verse','section'))
verse_id INTEGER  -- verse anchor; NULL for sections
section_id BIGINT REFERENCES sections(id)  -- work anchor; NULL for verses
span_start/span_end INTEGER  -- REUSED: char offset into verse text OR sections.body
translation TEXT  -- verse-only (offsets are translation-relative); NULL for sections
source_content_hash TEXT  -- section-only: detect re-ingest drift, degrade to a section indicator
CHECK (exactly one of verse_id / section_id is set)
```

**Migrations (owner-run, additive, idempotent):**
- **MIG-A** — make `highlights`+`notes` polymorphic (add `target_kind`/`section_id`/`source_content_hash`, drop `verse_id` NOT NULL, add the XOR CHECK). **Rework `notes` unique index to verse-only** (`WHERE target_kind='verse'`) so section notes can be many-per-section without breaking `upsertNote`'s `ON CONFLICT`. Existing rows backfill to `target_kind='verse'`. *(The one with data-shape risk.)*
- **MIG-B** — `bookmarks` (polymorphic; an explicit saved *spot*, distinct from auto reading-progress).
- **MIG-C** — `library_items` (bookshelf; `shelf ∈ {reading, saved(=Save-For-Later), archived}`, `UNIQUE(user_id, source_id)`). *(Note: existing `user_library` = uploaded files — do NOT overload it.)*
- **MIG-D** — `reading_progress` (`user_id, source_id, last_ordinal, char_offset, percent`, `UNIQUE(user_id, source_id)` upsert). *(Existing `reading_history` is Bible-chapter-grained — distinct.)*
- **MIG-E** — `tags` + `annotation_tags` (polymorphic tag join over highlight/note/bookmark/library_item). *(`notes.tags TEXT[]` already exists — highlights get the same, giving Tags/Topics nearly free.)*

All new user tables get the identical RLS block (copied from `highlights`/`notes`); **no new GRANT** (001 `ALTER DEFAULT PRIVILEGES` covers them). Verify with two accounts, not by reading policy.

## 5. Search — per-type and cross-corpus

The substrate exists: `sections.tsv` is a GENERATED tsvector with a GIN index. Build `searchSections({query, sourceType?, sourceId?, tradition?, limit, offset})` on the `commentary-search.ts` pattern (`ts_headline` snippets, capped count, keyset paging):
- **In a catalog** (Commentaries / Sermons / Hymns&Poetry): filter `source_type = $type AND status='published'`.
- **In an open work:** `AND source_id = $1`, results deep-link to `#s{ordinal}`.
- **In My Library:** union my notes/highlights (body match) + my added works, each badged "from your library."
- **Dedupe chunks to reading-units** — a work is many `sections`, so multiple chunks of one sermon can all match; collapse to the parent reading-unit in results.
- New routes `GET /api/search/works` (+ `sourceType` facet), reusing the `/library/commentaries` search UI (facet chips, "Load more (X of Y)").

## 6. Ingress / egress (each: trigger → store → query → RLS)

**Ingress:** corpus ingest → `sources`/`sections` (owner-run, no RLS, publish = human gate) · create highlight/note/bookmark from either reader → extend `POST /api/annotations` with a `target` discriminator · add work to library / save-for-later → `POST /api/library` · tag → `tags`+`annotation_tags` · reading-progress → throttled `PUT /api/progress`. Section-offset capture reuses `rangeToOffsets`/`snapToWords`; anchor to `sections.body`, never DOM offsets.

**Egress:** book reader renders sections (DB, paginated, `status='published'` filter — the DB analogue of the client-side published filter) · library surfaces works + annotations + tags (extend `/api/annotations/all` to return section-anchored rows + bookmarks) · in-work/cross-work search · export notes (assemble to markdown, user-scoped).

## 7. Sequencing & the shared foundation

- **After go-live** (there must be live works to read).
- **Built together with the highlighter rebuild and the Greek/Hebrew hover** — all three share the tokenization + annotation foundation. Building them separately means building the annotation model twice. So the natural build order: the shared annotation engine + book reader first, the Logos popover rides it, the hover-definition layer rides the same tokenization.
- Pairs with **sermon search** (the moat): word study + attributed voices + your own sermons, all in one reader — the "My Studies / My Work" vision.

## 7a. Locked build decisions (owner, 2026-07-18)

These are settled — the build proceeds on them; the agent does **not** re-open them:

1. **Build order — FOUNDATION FIRST.** Ship the shared annotation engine + the Logos-style highlighter into the *existing* Bible reader first (a visible win + de-risks the one foundation highlight/note/hover all sit on) → then the Book Reader → then the Library hub + catalogs. One slice proven deep before the next opens.
2. **Reading feel — CALM & IMMERSIVE, matching today's app.** Same warm paper/serif and chrome as the current reader. Reading is clean and book-like by default; TOC, notes, search, and the highlighter stay out of the way until summoned. Mobile-first (390px is a first-class layout, not an afterthought). The mockups are **direction, not a final pixel spec** — match the app as it sits today.
3. **Content nav — SEPARATE SECTIONS; "Hymns & Poetry."** Commentaries · Sermons · Hymns & Poetry · Word Study as distinct catalogs. Poems + hymns are one "Hymns & Poetry" section with an inside Hymns/Poetry sub-filter. (Resolves the §8.5 naming open item — "Music" is dropped.)
4. **Highlighter — LOGOS-STYLE, IN OUR SKIN.** The Logos interaction (select words → color → note/bookmark/ask), styled to Ancient Paths (our colors, type, spacing) — **not** a Logos clone. **Tap-the-verse → commentaries stays exactly as it works today; do not change it.**

## 8. Decisions to log (`docs/DECISIONS.md`) before building

1. **`sections` is a retrieval unit, not a reading unit** — reconstruct works by ordering chunks (MVP) vs add a `unit_ordinal` grouping column (durable, needed before Spurgeon-scale). Pick one.
2. **Section-anchor drift** — pin `source_content_hash`; degrade to a section-level indicator on re-ingest mismatch (never a corrupt highlight — the translation-pin lesson generalized).
3. **Two readers, one annotation store** — extend `highlights`/`notes`/`favorites` polymorphically, don't duplicate.
4. **Three save verbs, never conflated** — highlight (text) · note (thought) · bookmark (spot); and Save-For-Later (a whole work) ≠ bookmark (a spot).
5. **Naming** — "Hymns & Poetry" vs "Music"; "Library" hub vs a second "Study" entry (recommend Library hub — /ask already owns "study").
6. **Attribution discipline holds everywhere** — author + work title, never a host URL, in the reader, the catalogs, and the library.

## 9. Build vs reuse (summary)

| Concern | Reuse | Build |
|---|---|---|
| Anchor math | `highlight-range.ts` core (generic) | rename `rangeToVerseOffsets→…InContainer` |
| Selection→persist | logic in `verse-display.tsx` | extract `useTextAnnotation(rootRef, resolveTarget)` |
| Selection popover | `HIGHLIGHTER_POLISH.md` plan | build once, mount in both readers |
| Persistence | `highlights`/`notes`, RLS, keyset indexes, `/api/annotations` discriminator | MIG-A polymorphic + `getWorkAnnotations` |
| Reader chrome | `reader-settings`, `StudyPanel` sheet, docked bar, localStorage prefs | `WorkReader`/`WorkToc`/`WorkHeader`/`WorkNav`, per-type catalogs |
| Data model | `006` sources/sections | `unit_ordinal`; MIG-B..E (bookmarks/library/progress/tags); `/api/work/*` |
| Search | `sections.tsv` GIN, `commentary-search.ts`, catalog UI | `searchSections` + `/api/search/works` (type facet) |
| Nav/IA | sidebar/mobile-nav idiom | corpus catalogs (Commentaries/Sermons/Hymns&Poetry) + `/library` hub |

## 10. Mockup specs (direction, not a pixel contract — match today's app)

Three wireframes were reviewed and approved as **direction**. Reproduce the *structure and interaction*, rendered in the current app's aesthetic (warm paper, existing type scale, existing spacing/border tokens). Do **not** invent a new visual language.

**10.1 — Book Reader with selection popover (the core new surface).**
- Layout: a **TOC rail** (left on desktop; a drawer on mobile) listing section headings; a centered **reading column** (comfortable measure, serif body, same as today's reader); a subtle **progress rail**.
- A persisted **highlight** renders inline (soft color wash behind the words, not a hard box).
- On text selection, a **Logos-style popover** appears near the selection (portal + collision-aware, per `HIGHLIGHTER_POLISH.md`): a row of **color swatches** (start with the app's existing highlight colors — yellow/green/sky/pink/amber family), then actions **Add note · Bookmark · Ask Ancient Paths**, then **copy chips: Copy styled · Copy lines · Text only**.
- A **context label** grounds the selection: `Author · Work · locus` (e.g. "Spurgeon · Treasury of David · Psalm 23") — author + work, **never a host URL**.
- On mobile: keep the docked-low action bar so the popover never fights the OS copy callout.

**10.2 — Navigation + content catalog (surface the corpus).**
- Left nav (rail on desktop / tab bar + drawer on mobile): **Home · Bible · Ancient Paths**, a **"Read"** group — **Commentaries · Sermons · Hymns & Poetry · Word Study**, and a **"You"** group — **Library**. The active item is highlighted in the app's accent.
- Catalog body (Sermons shown): a **title + one-line description**, a **search-within-type** field, **facet chips** (All · Reformed · Puritan · Patristic · Baptist …), then a **work list** — each row: an author monogram, work title, `Author · tradition · count` subline, and a chevron that **opens the work in the Book Reader**.

**10.3 — Library hub (the personal home).**
- Header: "Library" + a one-line subtitle.
- **Continue reading** row: resume cards (work title, `author · locus`, a thin progress bar).
- **Yours** grid: **My Library** (bookshelf) · **Notes** · **Highlights** (swatch cluster) · **Bookmarks** · **Save for later** · **Tags**. Each a small card with icon + label + count.
- **The corpus** row: chips linking to the catalogs — Commentaries · Sermons · Hymns & Poetry · Word Study.
- This directly fills the gaps the owner named: **My Library, Continue Reading, Bookmarks, and Tags** were the missing sections (Notes/Highlights/Save-For-Later were already known).
