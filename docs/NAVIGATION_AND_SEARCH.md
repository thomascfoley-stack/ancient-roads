# Document 5: Reference navigation and search

Two promises this document exists to keep:

1. Any passage is reachable in three interactions or fewer, from anywhere.
2. A typed reference never mis-resolves. "jn 3 16" opens John 3:16, every
   time, or shows exactly why not.

Verse selection is the front door of the product. Logos wins power users
with reference tooling and loses everyone else to complexity; YouVersion
wins everyone with a three-tap picker and loses students to shallow search.
We need YouVersion's floor and Logos's ceiling.

Implementation: [src/bible/ref-parse.ts](../src/bible/ref-parse.ts) (resolver),
[src/bible/aliases.ts](../src/bible/aliases.ts) (book alias data).

---

## 1. What the incumbents teach (researched 2026-07)

### Logos

- **Everything is milestone-indexed.** Every resource carries verse-keyed
  milestones; Bibles and commentaries scroll-link because they share the
  verse datatype, and the Passage Guide ("everything in my library on Rom
  8:1-4") is a library-wide join on verse ranges. This validates
  `section_anchors` (SCHEMA.md §4) as the load-bearing table of the whole
  product. Anchor quality is the product.
- **A typed reference is a command, not a query.** Reference boxes and the
  command box jump straight to the passage; references inside any book are
  hover-previewable links. Search never swallows a reference.
- **Two search engines, explicit scopes.** Precise search (operators,
  proximity, morphology) and Smart Search (semantic + AI synopsis with
  citations) over explicit scopes: All / Bible / Books / Factbook. Users
  always know what corpus they are searching.
- **User-ranked priority orders results.** Commentary results follow the
  user's priority list. Our analog: tradition/era facets plus
  `profiles.tradition` as a ranking weight (never a filter).
- **What we deliberately skip:** datasets/Factbook, sentence diagrams, the
  full morph query language, tab management. The three-pane + Read mode
  decision (DESIGN_BRIEF #4) already rejects Logos's window model.

### YouVersion (bible.com)

- **The picker is a location chip + two grids.** A persistent chip shows
  the current location ("John 1"); tapping it opens a full-screen picker:
  book list (canonical order with an A-Z toggle), then a chapter-number
  grid, then an optional verse-number grid. Two taps to a chapter, three
  to a verse. Continuous scroll crosses chapter boundaries in the reader.
- **Versions and languages are separate axes.** The version chip (reader,
  top right) switches among versions in your language; a language switcher
  and search cover the full catalog (thousands of versions, 2,000+
  languages). Version choice is sticky per user; versions download for
  offline individually.
- **One search box, intent-detected.** The same input takes "1 Peter 4:1",
  "faith", or "iron sharpens iron"; references are detected and routed to
  the reader, keywords go to verse search scoped to the current version,
  with suggestions as you type. Curated topic chips and emotion-based
  browse sit beside free search (their fat head; ours is DESIGN_BRIEF #6).
- **Weaknesses we exploit:** keyword search is single-version at a time; no
  commentary layer; no original languages; topical results are thin.

### The parsing ecosystem

- openbibleinfo's **bible-passage-reference-parser** (npm, v4 beta as of
  2026-07) is the standard: sequences, ranges, context carryover
  ("v. 16"), Roman numerals ("Rom. viii. 28"), versification systems,
  2,000+ languages, OSIS output. It is built for finding references in
  prose. **Use it at ingestion** (CORPUS.md stage 4) and for linkifying
  user-typed chat text; map its OSIS output onto canonical verse IDs.
- The interactive omnibox needs a different shape: incremental,
  typeahead-first, verse-ID-native, zero-dependency. That is
  `src/bible/ref-parse.ts`, ours.

## 2. Decisions of record

1. **A parsed reference is navigation, never search.** The omnibox runs
   the resolver first; on success it opens the reader (and shows a passage
   preview row). Search only sees input the resolver rejects. When input
   is both a plausible reference and a plausible word ("judges"), show the
   reference row pinned above search results — never make the user fight
   the parser.
2. **One omnibox, three intents.** Reference → reader. Topic alias hit
   (`topics.aliases`, SCHEMA.md §5) → published guide. Everything else →
   hybrid search. This is SCHEMA.md §8 applied to the search surface, not
   just teachers.
3. **The picker is YouVersion's, refined.** Location chip in the reader
   panel → book list (canonical order, A-Z toggle, recent books row from
   `reading_history`) → chapter grid → optional verse grid (skippable:
   tapping a chapter opens it; verse tap is for precision). Full-screen
   sheet on mobile, popover on web. Two taps to a chapter, never more
   than three to a verse.
4. **One resolver owns every reference surface.** Omnibox, deep links
   (`/read/john/3#16`), chat linkification, and ingestion anchoring all
   resolve through the same canonical tables (`books.ts`, aliases,
   verse IDs). Ingestion adds the BCV parser for prose, but its output
   flows through the same verse-ID encoding. No second opinion anywhere.
5. **Version is a reading preference, not a search axis (launch).**
   Navigation and anchoring are canonical-ID operations, version-blind.
   The version chip switches display text in place; keyword verse search
   runs against the user's translation (YouVersion pattern). Parallel
   view and cross-version search are post-launch.
6. **Search retrieves; it never generates.** Results are verses, corpus
   sections (tradition-badged, grouped by work), published guides, and —
   flagged clearly — user-library sections. No prose synthesis in search
   results; "Ask @study-guide about this" hands off to a study, where the
   contract and verifier apply. This keeps the no-interpretation
   guarantee out of search's threat model entirely.
7. **Original-language search ships small.** Tap a word in the reader →
   lemma/Strong's occurrence list (a `original_words` lookup, SCHEMA.md
   §3). The full morph query language is deliberately deferred; Logos-
   grade morphology search is a power feature we add when word study
   proves demand.

## 3. The resolver (src/bible/ref-parse.ts)

Grammar, informally:

```
input     := book [chapter-part]
book      := ordinal? name          -- "1 john", "I Jn", "first john", "jn"
chapter-part := chapter
             | chapter sep verse [suffix] [range] [, sequence...]
             | chapter "-" chapter               -- "matt 5-7"
sep       := ":" | "." | " " | "v"               -- "3:16" "3.16" "3 16" "3v16"
range     := "-" (verse | chapter sep verse)     -- "16-18", "3:16-4:2"
suffix    := "a".."d" | "ff"                     -- dropped / to-chapter-end
```

Behavior rules:

- **Book matching** is alias-exact first, then unique-prefix over the
  alias table. Ambiguous prefixes ("j") return candidates for the
  typeahead, never a guess. Conventional abbreviations are explicit
  aliases so convention beats prefix logic: "phil" is Philippians, never
  Philemon; "jud" is Jude, "judg" Judges.
- **Single-chapter books:** "Philemon 6", "Jude 24", "Obadiah 21" resolve
  as verse of chapter 1 (the universal convention), and display without a
  chapter number. "Phm 1:6" also accepted.
- **Bare book** ("john") resolves to the whole book (kind `book`);
  navigation opens chapter 1.
- **Chapter-granularity ranges** end at verse 999 (sentinel) until the
  verses table supplies real counts via an injectable
  `VerseCountProvider`; ranges are inclusive and clamp to real counts
  when the provider is present. The sentinel is range-safe against
  `section_anchors` because real verse numbers never reach 999.
- **Sequences** ("john 3:16, 18-20, 4:2") inherit book and chapter left
  to right, exactly like print citations.
- **Rejects, never guesses:** chapter beyond the book ("Genesis 51"),
  verse 0, backwards ranges, unknown books. Errors carry a reason the UI
  can show ("Genesis has 50 chapters").
- Not this module's job: finding references inside prose (BCV parser at
  ingest), context-relative references ("v. 16" — the reader knows its
  own chapter), non-English input (post-launch, alias table is designed
  to take per-language rows).

## 4. Omnibox behavior (Cmd+K / the Search mode input)

| You type | Top row(s) | Enter does |
|---|---|---|
| `jn 3 16` | John 3:16 + verse preview text | opens reader at John 3:16 |
| `jn 3:16-18` | John 3:16–18 + preview | opens reader, range highlighted |
| `1 co 13` | 1 Corinthians 13 | opens chapter |
| `j` | book completions (John, Joshua, ...) | completes, does not navigate |
| `judges` | Judges (book) pinned; "judges" keyword results below | opens Judges 1 |
| `anxiety` | topic guide "Anxiety" pinned; search results below | opens the guide |
| `iron sharpens iron` | verse hits (Prov 27:17 first), then corpus sections | opens top result |
| `what did calvin say about prayer` | corpus sections (Calvin first), "Ask @study-guide" row | opens section in context |

Budgets: parse is synchronous and allocation-light (<1ms); preview text
fetch <150ms; typeahead completions render on every keystroke with no
network round-trip (aliases ship to the client). Recent passages and
"continue reading" (from `reading_history`) fill the empty state.

## 5. Search architecture (the third top-level mode)

Pipeline per query (SCHEMA.md §8 generalized):

1. **Resolve**: reference? → reader. Topic alias? → guide. Else:
2. **Retrieve**, in parallel:
   - Verses: `websearch_to_tsquery` over `verses.tsv`, user's
     translation. Book/testament filters are integer predicates on
     `verse_id` (book N = `verse_id between N*1e6 and (N+1)*1e6 - 1`) —
     no joins.
   - Corpus sections: BM25 (`sections.tsv`) + pgvector HNSW
     (`section_embeddings`, bge-m3) in parallel, RRF-merged, reranked
     (bge-reranker-v2-m3 via DeepInfra) top-50 → top-10.
   - Guides: `topics` title/alias trigram match.
   - User library (when toggled): same hybrid over `user_sections`,
     results badged "from your library".
3. **Present** grouped, never blended: guides pinned, then passages
   (verse hits annotated with how many corpus sections anchor there —
   the "what others said" scent), then sections grouped by work with
   tradition + era badges, then library hits. Facets: scope (Bible /
   corpus / my library), tradition, era, source_type, testament/book.
4. **Hand off**: every result group carries "Ask @study-guide about
   this" → creates/opens a study with the query as first message. Search
   is free-tier; teacher messages are metered (DESIGN_BRIEF free plan).

Ranking notes: `profiles.tradition` boosts (never filters) same-tradition
sections; anchor density (how many sections anchor to a verse) boosts
passages — the corpus itself tells us which verses history cared about.

## 6. Models: what gets trained, what never does

Decision (extends DESIGN_BRIEF #1/#2): **corpus content never trains the
generator.** Commentaries and Bible text live in the database and reach
the model only through retrieval, because:

- Weights can't cite. A model that "knows" Chrysostom asserts Chrysostom
  uncited — exactly I1, unverifiable, unrevokable.
- The guarantee dies quietly: a generator trained on commentary will
  volunteer interpretation with perfect fluency, and the verifier becomes
  an adversary instead of a checkpoint.
- Licensing forecloses it: modern translations/commentaries (month 9+
  BD track) will license display, not training. One pipeline for all
  content beats two legal postures.
- Freshness: corpus fixes are an UPDATE; weight fixes are a training run.

What we DO train (unchanged from the brief, sharpened):

| Component | Trained on | Risk to guarantee |
|---|---|---|
| Embeddings/reranker (later, if retrieval evals demand) | corpus text pairs, domain adaptation | none — retrieval only, more faithful search |
| Generator LoRA/DPO (phase 4) | our own transcripts: contract shape, summary fidelity, refusal shape — form, not facts | reduces it — trains contract-keeping, not theology |
| V2 classifier | logged verifier verdicts | none — it enforces the guarantee |
| Distilled small model (post-50k transcripts) | teacher-model transcripts | same as generator row |

The one legitimate "train on the Bible" idea — domain-adapting the
embedding model on scripture + commentary — improves retrieval and has
zero interpretive surface. Do it when eval numbers say bge-m3 stock is
the bottleneck, not before.

## 7. Build order

1. ✅ Resolver + alias table + test suite (`src/bible/ref-parse.ts`)
2. Ingest WEB (CORPUS.md order #1) → `verses` rows + generated
   verse-count table → resolver gets real `VerseCountProvider`
3. Reader route `/read/[book]/[chapter]` with location-chip picker
   (books → chapters → verses, recents from `reading_history`)
4. Omnibox with reference + topic intents (search intent stubbed)
5. Verse keyword search (tsv) + corpus section BM25 behind facets
6. Embeddings + hybrid merge + reranker
7. Word-tap → lemma occurrences (original_words)

Steps 2-3 make the product demoable as a Bible reader; step 4 makes it
feel flawless; steps 5-6 make it a study tool.
