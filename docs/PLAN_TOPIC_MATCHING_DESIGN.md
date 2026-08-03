# PLAN TOPIC MATCHING — matching a user's phrase to an ingested topic, never inventing one (design note, 2026-08-02)

**Status: BUILT, both halves** (approved live 2026-08-02 evening; §§2-3 landed with ADR-047, §4 landed
the same night as the topic→plan wiring — migration 042 `plan_day_readings`, `expandTopicalPlan`,
the store's topic branch, and the builder's topic search UI; end-to-end proof in
`web/test/regression/plan-topic-flow.test.ts`, executed against dev with an owner-seeded published
fixture). §5's out-of-scope items (hybrid, query-memory) remain out.

## 1. What this is, and what it is deliberately not

A user types a phrase — "prayer," "faith and family," "affliction" — and the product returns **up to 3
candidate topics**, each pointing at a real, already-ingested heading from Nave's Topical Bible, Torrey's New
Topical Textbook, or the OpenBible.info curation (`sources.source_type = 'topical_index'`, ADR-046). The user
(or the LLM acting on the user's behalf) **picks one**; nothing is auto-selected.

**This is not `/ask`'s retrieval problem, and does not carry its accuracy bar.** `/ask` matches a free-form
question against open passage content across the whole legal corpus — that is the retrieval surface
`CLAUDE.md`'s topical-accuracy figures (topical 45/75 → 80/90 v4) govern. This function matches a short phrase
against **12,941 short, author-written topic HEADINGS** across exactly three works — a controlled-vocabulary
lookup, not open passage retrieval. It never touches `LEGAL_CORPUS_FILTER`, `retrieveCommentary`, or any
`/ask` code path, so it owes no re-run of the held-out eval. It does owe its own honesty check (§6).

**It never composes.** The three sentences of design that make this safe:
1. The function returns pointers (work slug + section id), never generated topic prose.
2. `PlanSpec.scope` only ever carries an **already-resolved** pointer (`{kind:'topic', workSlug, sectionId}`),
   never a free-text query — the same discipline `book`/`range`/`books` scopes already have.
3. A plan built from a topic pulls its days from that topic's real `topical_entries` rows (ADR-046), in the
   order the original author printed them. If a phrase matches nothing, the function returns zero candidates
   and says so — it does not fall back to inventing a plausible-sounding topic.

## 2. Interface

```ts
// web/src/lib/plan/topic-match.ts
export interface TopicMatch {
  workSlug: string;      // 'naves-topical-bible' | 'torreys-topical-textbook' | 'openbible-topics'
  workTitle: string;     // for display: "Nave's Topical Bible"
  sectionId: number;
  heading: string;       // the author's own topic name, verbatim
  entryCount: number;    // how many passages this topic anchors — lets the UI say "(63 passages)"
}

export async function matchTopics(query: string, limit = 3): Promise<TopicMatch[]>;
```

Bounded (`limit`, hard cap 10 server-side — never unbounded, per `CLAUDE.md` coding standards), read-only,
no embedding call. `query` is validated at the edge the same way `PlanSpec.scope.range.ref` already is
(1–100 chars, trimmed) before it reaches SQL.

## 3. Retrieval: FTS only, for now

```sql
SELECT s.id, s.heading, src.slug, src.title,
       (SELECT count(*) FROM topical_entries te WHERE te.section_id = s.id) AS entry_count,
       ts_rank_cd(s.tsv, websearch_to_tsquery('english', $1)) AS rank
FROM sections s
JOIN sources src ON src.id = s.source_id
WHERE src.source_type = 'topical_index'
  AND src.status = 'published'
  AND s.tsv @@ websearch_to_tsquery('english', $1)
ORDER BY rank DESC
LIMIT $2
```

`sections.tsv` is already a `GIN`-indexed generated column (`sections_tsv_idx`, migration 016) and
`websearch_to_tsquery` is the exact pattern `search-sections.ts` already uses in production — no new index,
no new infrastructure. `status = 'published'` means this returns nothing until the owner's publish flip for
the four topical works lands (STATE_OF_TRUTH §2f) — the gate is inherited, not re-invented.

**Daily Light is deliberately excluded** (`source_type = 'devotional'`, not `'topical_index'`): its headings
are dates ("08.02 — Morning"), not topics. It is a candidate for a *different* plan shape later (a fixed
366-day devotional sequence), not this matcher.

**Semantic/embedding fallback is explicitly out of scope for this slice.** FTS over 12,941 short, mostly
single-word-or-short-phrase headings should cover the common case ("prayer," "faith," "family") well; if a
usage pass shows real misses (a phrase with no literal-word overlap to any heading), the fallback is a single
additional `ORDER BY embedding <=> $1::vector` leg on the same table — cheap to add later, not worth building
speculatively now.

## 4. Selection → plan

Once a `TopicMatch` is chosen, `POST /api/plans` receives `{ scope: { kind: 'topic', workSlug, sectionId } }`.
`expandPlan`'s `chaptersOfScope` gains nothing here — a topic scope does not walk chapters. Instead:

1. Load the topic's `topical_entries` rows, ordered by `ordinal` (the author's own sequence).
2. Bucket them across the requested `weeks × daysPerWeek` reading days using the **same distribution
   arithmetic already in `expandPlan`** (even split across N days) — the bucketing math is agnostic to
   whether it is dividing chapters or dividing labeled entries; only what it divides changes.
3. Each day's "passage" is one or more `topical_entries` verse anchors, carrying the entry's own `label`
   (e.g., "Daily, in the morning") instead of a chapter number.

## 5. Out of scope for this slice

- **The topic + canonical hybrid** ("Pauline epistles, correlated with early-church history") — matching a
  topic *and* intersecting it with a `books` scope's anchor range. Real, requested, and a small extension
  once both halves exist independently — not built here to keep this slice reviewable.
- **The query-memory cache** ("build in memory so we can quickly match repeat askers") — explicitly deferred
  by the owner this session ("we're not here yet").
- **A dedicated `/api/plans/topics/search` route** is needed for the UI to call `matchTopics` — trivial once
  the function exists, added alongside it, not treated as a separate design question.

## 6. The honesty check this slice does owe

Not the held-out statistical eval (§1) — a **manual spot-check**, recorded once: run `matchTopics` against a
handful of real phrases (prayer, faith, family, affliction, suffering, grace) and confirm the top-3 are sane.
Recorded in `WORKLOG.md` at build time, not a frozen/pre-registered bar — this surface is small and
controlled enough that a spot-check is proportionate, not a statistical claim.
