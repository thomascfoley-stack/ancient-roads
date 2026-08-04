# Plans on production — migrations 039/041/042 + verse_coverage (2026-08-03)

Owner go given live ("do the publish flip and prod migrations"), then narrowed to
039/041/042-only after the read below showed the publish flip was not yet possible.

## What the prod read established (BEFORE any write)

| fact | value |
|---|---|
| `plans` / `plan_days` / `plan_day_readings` / `verse_coverage` / `topical_entries` | **all ABSENT** |
| migration ledger high-water | `038_devotional_source_type.sql` |
| `sources.source_type` allows `topical_index` | **no** |
| the four topical works on prod | **none — zero rows** |
| corpus | 124 published / 7 staged, 380,971 sections, 100,212 anchors |

**The publish flip was therefore a no-op**: the works it would flip do not exist on
production. They were ingested to the dev branch (`ep-tiny-hat`). Reported to the owner
rather than executed as a zero-row success.

## What was applied

`MIGRATE_ALLOW_PROD=1`, one file at a time, each recorded in `schema_migrations` with its
sha256:

- `039_plans_coverage_topical.sql` — plans, plan_days, verse_coverage, topical_entries
- `041_plans_delivery_fields.sql` — dormant delivery_channel / calendar_minutes
- `042_plan_day_readings.sql` — plan_day_readings

**040 DELIBERATELY HELD.** It is the only one touching shared tables (the `source_type`
CHECK on `sources` AND `embeddings`), and A9's served cutover is doing live DDL on
`embeddings`. Holding it also means no `topical_index` source can be created on prod yet,
which is consistent: the corpus is not there either.

### Verified after

- five tables present; RLS enabled on all three user tables; three policies present
- `plans.delivery_channel` + `plans.calendar_minutes` present
- `source_type` still WITHOUT `topical_index` (the hold, confirmed rather than assumed)
- corpus counts unchanged: 124/7, 380,971 sections

## verse_coverage on production

`COVERAGE_ALLOW_PROD=1`, dry-run first, then executed:

```
anchors: 96,329 fetched, 96,329 admitted (0 banned-author, 0 forbidden-provenance)
coverage: 30,277/31,103 verses covered, 27,163 with >=2 authors
```

Spot-checked, and the refusal gate is honest on prod: **Song of Songs = 5 verses covered,
1 with >=2 authors** (a plan there is refused), Romans 431/431, Genesis 1,516/1,413.
`app_runtime` holds SELECT and not INSERT.

## Still required before topical plans serve on production

1. **040** (blocked behind A9's `embeddings` work)
2. **The corpus copy** — built this session, dry-run verified, NOT executed (see below)
3. The publish flip
4. A deploy: `/plans` lives on `feat/study-plans-adr045`, not on `main`

## The copier now carries topical_entries

`scripts/corpus-copy.mjs` predated the table and would have moved a topical work as
headings with no plan-able structure — silently, because every other count reconciles.
Added: `topical_entries` in `COPIED_TABLES`, a paging read keyed on **(section_id,
ordinal)**, the census column, and the post-copy comparison **derived from the census row
instead of a hand-typed key list** (the list is why this class of gap ships).

Dry-run dev→prod, gate-passing after the four manifest entries were added:

```
naves-topical-bible        sections= 4870 anchors= 71251 topical= 78107 flat= 5357
torreys-topical-textbook   sections=  628 anchors= 34931 topical= 38858 flat= 1055
openbible-topics           sections= 6711 anchors= 68923 topical= 71210 flat= 6670
daily-light                sections=  732 anchors=  6994 topical=  7011 flat=  747
```

`scripts/redproof-corpus-copy.sh`: **59 passed, 0 failed**, including three new topical
assertions. The first version of those assertions was **watched NOT failing** against a
mutated keyset — the happy-path fixture is 10 rows against a 2,000-row page, so paging
never ran and the check could not fail. Moved into the paging block (READ_PAGE=2) and
re-mutated: **8 of 10 entries, 2 of 4 on the multi-entry section — red**, then green on
revert.
