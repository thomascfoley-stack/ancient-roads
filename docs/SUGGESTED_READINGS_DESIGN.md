# SUGGESTED READINGS — choosing what to search, and searching it honestly (design, 2026-08-06)

**Status: DESIGN. No code. The owner approves section by section before anything is built.**

The ask, in the owner's words: a count of suggested readings on the work itself ("32 suggested
readings", not "the tradition"); checkboxes for which kinds of work to include — hymns, poems,
historians, commentaries, theology; the choice made at upload; and a progress bar, because "as
long as there's a loading bar, people will be patient." Explicitly: **it does not have to be fast.**
"If somebody uploads their work and they select Search All, then we just search all, and it's going
to take a little bit of time."

That last sentence is what makes this design possible, and it changes the shape of everything below.

---

## 0. A defect in what already shipped, which this design must fix

`relatedVoices()` (shipped 2026-08-06) sweeps the HNSW index with `LIMIT 300` at the default
`hnsw.ef_search = 40`. **Measured against production, that returns 21 rows out of 60 asked for.**

    LIMIT 60, unfiltered          ef=40    89ms   21/60 rows   <- silently short
                                  ef=200 2,634ms   60/60
                                  ef=800 7,439ms   60/60      (ef caps at 1000)

Add a category filter and it collapses completely: `metadata->>'work' = ANY(<poetry slugs>)`
returned **0 rows in 83ms**. The index walks its candidate list, the filter rejects nearly all of
it, and the scan gives up — the starvation `SERMON_SEARCH_DESIGN` §5 already names for the user
plane, here on the corpus plane.

So the panel now in production is not returning the nearest works; it is returning *some* near
works. It looked right — Owen, Watts, Herbert are all plausible — which is exactly why it went
unnoticed. **Nothing below builds on that query shape.**

## 1. What is actually there, measured 2026-08-06 against `ep-odd-fog`

398,113 served rows. `metadata->>'register'` is present on only 314,120 of them (79%), so it
cannot be the filter key. `sources.source_type`, joined on `slug = metadata->>'work'`, covers
**385,681 rows — 96.9%** — and matches the taxonomy the sidebar already shows:

| category (sidebar label) | `source_type` | rows | works |
|---|---|---|---|
| Sermons | `sermon` | 162,507 | 6 |
| Commentaries | `commentary`, `father` | 133,533 | 33 |
| Theology & Creeds | `theology`, `confession` | 35,341 | 12 |
| Hymns | `hymn` | 6,887 | 32 |
| Devotionals | `devotional` | 6,589 | 15 |
| Poetry | `poetry` | 4,085 | 13 |
| Historians | `historian` | **0** | **0** |
| (unjoinable) | — | 12,432 | — |

**Two findings the UI has to respect.** `Historians` is a first-class sidebar catalog with
**nothing served behind it** — offering it as a checkbox would be offering an empty box. And 12,432
served rows (3.1%) carry no `work` slug that resolves, so they are reachable by "everything" but by
no category; they are counted honestly as uncategorised rather than quietly dropped.

## 2. The decision: exact search per category, not the index

Because the owner has said it need not be fast, the index can be abandoned for this feature, and
that removes the entire starvation problem rather than tuning around it. An index-free scan over a
category subset is the **true** top-k, with no `ef` to get wrong.

Measured, exact top-40 per category (`enable_indexscan = off`), cold:

| category | time | rows |
|---|---|---|
| Poetry | 0.4s | 40/40 |
| Hymns | 1.3s | 40/40 |
| Confessions | 1.5s | 40/40 |
| Theology | 1.8s | 40/40 |
| Sermons | 2.1s | 40/40 |
| Devotionals | 4.2s | 40/40 |
| Fathers | 8.6s | 40/40 |
| Commentaries | 28.6s | 40/40 |
| **All of the above** | **48.8s** | |

Every one returns the full 40. **"Search All" is ~49 seconds sequentially** — close to the owner's
own 30-second estimate, and the honest number to build the progress bar from. (These are single
cold runs on a shared endpoint; `sermons` at 2.1s after `commentaries` at 28.6s is warm cache, not
a smaller job. Treat them as an order of magnitude, and re-measure before pinning any constant.)

## 3. The consequence: this is a job, not a request

49 seconds does not belong on a request path. The current `/related` route declares
`maxDuration = 30` and would time out on "Search All" — the feature would fail exactly when the
owner used the setting he asked for.

It also should not run per page view: the count has to appear on the card in the document list, and
recomputing a 49-second search to render "32 suggested readings" on every visit is absurd.

**So suggested readings are computed once, stored, and re-run only on request.** That is the
ingestion queue this slice already built — `FOR UPDATE SKIP LOCKED`, `after()` kick, per-document
status with retry — pointed at a second kind of work. Nothing new is needed for it to exist.

## 4. Data model (migration 105 — the 100-block, per the Lane B rule)

```sql
-- WHICH categories this document searches. NULL = not yet chosen (treat as the default set).
ALTER TABLE user_documents ADD COLUMN search_categories TEXT[];
-- The progress of the reading search, separate from the INDEXING status so a re-run never makes a
-- ready document look unindexed.
ALTER TABLE user_documents ADD COLUMN readings_status TEXT
  CHECK (readings_status IN ('pending','running','ready','failed'));
ALTER TABLE user_documents ADD COLUMN readings_done_at TIMESTAMPTZ;

CREATE TABLE user_document_readings (
  document_id TEXT NOT NULL REFERENCES user_documents(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,                 -- denormalized: every RLS policy a direct match
  category    TEXT NOT NULL,                 -- the sidebar category this was found under
  author      TEXT NOT NULL,
  work        TEXT NOT NULL,
  work_title  TEXT,                          -- resolved once, so no slug ever reaches a reader
  tradition   TEXT,
  similarity  REAL NOT NULL,
  PRIMARY KEY (document_id, category, author, work)
);
-- RLS identical to the other four user tables; index on (user_id, document_id).
```

The count on the card is then `SELECT count(*) … WHERE document_id = $1` — instant, and the same
number the reading view shows, because there is one place it lives.

## 5. The progress bar: honest, and therefore better than the fake one

The owner asked for a 30-second bar that fills and then "hurries up" when the work finishes. The
measured structure makes a *real* one just as easy, and it cannot embarrass itself:

- the job has **discrete, named steps** — one per selected category;
- each step has a **measured cost** (§2), so the bar is weighted by expected seconds rather than by
  step count, and does not lurch from 12% to 90% when Commentaries finishes;
- the UI polls the document and shows the step by name: *"Searching commentaries… 3 of 6."*

This is strictly better than a timer: it never sits at 99%, it never finishes at 8%, and when a
category is slow the user is told which one. A timed bar is a guess about a number we have already
measured. **Recommendation: drive it from real steps, and keep the owner's UX intent — something
always moving, an estimate always visible.**

Fallback, stated: if polling proves too chatty, the same steps stream over one response. Not
proposed for the first slice; polling reuses what the status wall already does.

## 6. The choice at upload

A category picker on the upload control, defaulting to **Commentaries + Sermons + Theology** —
the three a preacher wants first — with Hymns, Poetry and Devotionals unchecked, and an explicit
**Search everything** switch. Historians is omitted until something is served behind it (§1).

The default matters: it decides what most documents cost. Defaulting to everything makes every
upload a 49-second job for people who never asked for poetry.

Editable afterwards from the reading view, which re-queues the job. The choice is stored per
document because it is a property of the document, not of the account: a funeral homily wants
hymns, an exegetical paper does not.

## 7. Wording (the guarantee applies here too)

"32 suggested readings" is the owner's phrase and it is the right one — it claims usefulness, not
authority. It must stay distinct from the anchor panel's claim, which is a fact about verse ids.
These are matched by meaning, and every row keeps its score.

**Never** "citations." A citation is something the author did; these are works the author has not
read yet. That word would make the product assert a relationship it has not measured.

## 8. Scope

**IN:** migration 105 · the category picker at upload · the queued readings job with per-category
steps · the stored results · the count on the card · the progress bar · the reading view grouped by
category · re-run on demand.

**OUT:** re-running automatically when the corpus changes (the results go stale silently; a
`readings_done_at` is stored so staleness is at least visible) · per-chunk search instead of the
document centroid (§9) · any relevance floor (§9) · Historians until it has content · surfacing
suggested readings inside `/ask`.

## 9. Risks, named

- **The centroid blurs.** One vector for a whole document is why this costs 49s and not 49s × N
  chunks, but a sermon that moves from grace to judgement averages into neither. Unmeasured. The
  cheap experiment is top-3 chunks instead of the mean, at 3× the cost.
- **No relevance floor.** Every selected category returns its nearest 40 whether or not anything is
  close, so a document unlike the corpus still fills its shelves. Scores are shown; a measured
  floor is not proposed until there is a set to measure one against.
- **48.8s is one cold run**, on a shared endpoint, with `commentaries` and `sermons` visibly
  affected by cache order. Pin no constant to it without re-measuring.
- **The 3.1% with no resolvable work slug** are unreachable by category. They are reachable under
  "search everything" and counted as uncategorised.
- **Job cost is per document, not per user.** Nothing here bounds how often a user may re-run;
  the existing per-hour upload quota does not cover it. A re-run limit belongs in this slice.
