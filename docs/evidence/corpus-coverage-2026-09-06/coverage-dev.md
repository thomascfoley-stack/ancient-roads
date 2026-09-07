# coverage-dev — tradition × source_type × dev rows + dev status

Date: 2026-09-07 (Track B3). Dev branch only, READ-ONLY (`BEGIN; SET TRANSACTION READ ONLY; ROLLBACK`),
endpoint `ep-tiny-hat-atdgpisx` (dev), credentials from the dev owner credential, never printed.

Reproduce:

```sh
export DATABASE_URL="$(cat ~/.neon_dev_owner_url)" NEON_BRANCH=dev
npx tsx scripts/coverage-matrix.mts
```

**Served-on-prod column: UNMEASURED.** No prod connection under this order (bylaw 7 — owner-terminal, per occasion).
The one command that measures it (owner only):

```sh
COVERAGE_ALLOW_PROD=1 DATABASE_URL=<prod owner url> npx tsx scripts/coverage-matrix.mts
```

Against prod the `published` column IS the served column. A two-column table presented as the answer would be a false answer.

**Lag note:** `sources.tradition` on dev reflects the manifest as of each work's last ingest —
the B1 manifest patch (2026-09-07, 775 entries off `unassigned`) is NOT in this table;
register-writer propagates it on the next ingest (`ON CONFLICT … DO UPDATE SET tradition=EXCLUDED.tradition`).

# coverage matrix — tradition × source_type
# declared: ingest/sources.config.json (917 entries)
# database: ep-tiny-hat-atdgpisx (read-only transaction)

| tradition | source_type | declared | db_rows | staged | published | quarantined | other |
|---|---|---|---|---|---|---|---|
| anabaptist | historian | 1 | 0 | 0 | 0 | 0 | 0 |
| anabaptist | theology | 2 | 0 | 0 | 0 | 0 | 0 |
| anglican | commentary | 13 | 1 | 0 | 1 | 0 | 0 |
| anglican | devotional | 2 | 2 | 0 | 2 | 0 | 0 |
| anglican | historian | 5 | 1 | 1 | 0 | 0 | 0 |
| anglican | hymn | 5 | 1 | 0 | 1 | 0 | 0 |
| anglican | lexicon | 1 | 0 | 0 | 0 | 0 | 0 |
| anglican | poetry | 8 | 7 | 2 | 5 | 0 | 0 |
| anglican | sermon | 13 | 0 | 0 | 0 | 0 | 0 |
| anglican | theology | 88 | 0 | 0 | 0 | 0 | 0 |
| anglican-evangelical | hymn | 0 | 1 | 0 | 1 | 0 | 0 |
| baptist | commentary | 7 | 0 | 0 | 0 | 0 | 0 |
| baptist | confession | 1 | 0 | 0 | 0 | 0 | 0 |
| baptist | devotional | 3 | 2 | 0 | 2 | 0 | 0 |
| baptist | sermon | 66 | 2 | 0 | 2 | 0 | 0 |
| baptist | theology | 13 | 0 | 0 | 0 | 0 | 0 |
| catholic | confession | 1 | 0 | 0 | 0 | 0 | 0 |
| catholic | devotional | 3 | 3 | 0 | 3 | 0 | 0 |
| catholic | father | 1 | 1 | 0 | 1 | 0 | 0 |
| catholic | historian | 1 | 0 | 0 | 0 | 0 | 0 |
| catholic | poetry | 3 | 2 | 0 | 2 | 0 | 0 |
| catholic | sermon | 5 | 0 | 0 | 0 | 0 | 0 |
| catholic | theology | 76 | 0 | 0 | 0 | 0 | 0 |
| cistercian | sermon | 1 | 1 | 1 | 0 | 0 | 0 |
| congregational | commentary | 4 | 0 | 0 | 0 | 0 | 0 |
| congregational | devotional | 1 | 0 | 0 | 0 | 0 | 0 |
| congregational | historian | 1 | 0 | 0 | 0 | 0 | 0 |
| congregational | hymn | 1 | 0 | 0 | 0 | 0 | 0 |
| congregational | lexicon | 1 | 0 | 0 | 0 | 0 | 0 |
| congregational | poetry | 1 | 0 | 0 | 0 | 0 | 0 |
| congregational | sermon | 7 | 0 | 0 | 0 | 0 | 0 |
| congregational | theology | 43 | 0 | 0 | 0 | 0 | 0 |
| devotio-moderna | theology | 1 | 1 | 1 | 0 | 0 | 0 |
| dispensationalist | commentary | 2 | 1 | 1 | 0 | 0 | 0 |
| dispensationalist | theology | 1 | 0 | 0 | 0 | 0 | 0 |
| english-mystic | theology | 1 | 1 | 1 | 0 | 0 | 0 |
| evangelical | poetry | 1 | 1 | 0 | 1 | 0 | 0 |
| evangelical | sermon | 1 | 0 | 0 | 0 | 0 | 0 |
| evangelical | theology | 20 | 0 | 0 | 0 | 0 | 0 |
| evangelical | topical_index | 1 | 1 | 0 | 1 | 0 | 0 |
| jewish | historian | 1 | 1 | 0 | 1 | 0 | 0 |
| jewish | theology | 2 | 0 | 0 | 0 | 0 | 0 |
| lutheran | commentary | 6 | 1 | 0 | 1 | 0 | 0 |
| lutheran | confession | 3 | 0 | 0 | 0 | 0 | 0 |
| lutheran | devotional | 1 | 0 | 0 | 0 | 0 | 0 |
| lutheran | historian | 1 | 0 | 0 | 0 | 0 | 0 |
| lutheran | hymn | 1 | 0 | 0 | 0 | 0 | 0 |
| lutheran | sermon | 1 | 0 | 0 | 0 | 0 | 0 |
| lutheran | theology | 26 | 0 | 0 | 0 | 0 | 0 |
| methodist | commentary | 5 | 2 | 0 | 2 | 0 | 0 |
| methodist | historian | 4 | 0 | 0 | 0 | 0 | 0 |
| methodist | hymn | 2 | 0 | 0 | 0 | 0 | 0 |
| methodist | sermon | 3 | 2 | 1 | 1 | 0 | 0 |
| methodist | theology | 14 | 0 | 0 | 0 | 0 | 0 |
| methodist | topical_index | 1 | 1 | 0 | 1 | 0 | 0 |
| moravian | poetry | 1 | 1 | 0 | 1 | 0 | 0 |
| nonconformist | commentary | 9 | 1 | 0 | 1 | 0 | 0 |
| nonconformist | devotional | 2 | 2 | 0 | 2 | 0 | 0 |
| nonconformist | hymn | 3 | 2 | 0 | 2 | 0 | 0 |
| nonconformist | sermon | 1 | 0 | 0 | 0 | 0 | 0 |
| nonconformist | theology | 8 | 0 | 0 | 0 | 0 | 0 |
| orthodox | theology | 4 | 0 | 0 | 0 | 0 | 0 |
| patristic | commentary | 2 | 0 | 0 | 0 | 0 | 0 |
| patristic | confession | 2 | 0 | 0 | 0 | 0 | 0 |
| patristic | father | 3 | 3 | 1 | 2 | 0 | 0 |
| patristic | historian | 1 | 0 | 0 | 0 | 0 | 0 |
| patristic | hymn | 1 | 0 | 0 | 0 | 0 | 0 |
| patristic | theology | 7 | 0 | 0 | 0 | 0 | 0 |
| presbyterian | commentary | 23 | 2 | 2 | 0 | 0 | 0 |
| presbyterian | historian | 1 | 0 | 0 | 0 | 0 | 0 |
| presbyterian | hymn | 10 | 0 | 0 | 0 | 0 | 0 |
| presbyterian | sermon | 2 | 0 | 0 | 0 | 0 | 0 |
| presbyterian | theology | 34 | 0 | 0 | 0 | 0 | 0 |
| puritan | commentary | 1 | 1 | 1 | 0 | 0 | 0 |
| puritan | poetry | 1 | 1 | 0 | 1 | 0 | 0 |
| puritan | sermon | 2 | 1 | 1 | 0 | 0 | 0 |
| puritan | theology | 30 | 0 | 0 | 0 | 0 | 0 |
| reference | confession | 1 | 1 | 0 | 1 | 0 | 0 |
| reference | father | 36 | 0 | 0 | 0 | 0 | 0 |
| reference | historian | 9 | 0 | 0 | 0 | 0 | 0 |
| reference | lexicon | 21 | 6 | 1 | 5 | 0 | 0 |
| reference | theology | 1 | 0 | 0 | 0 | 0 | 0 |
| reference | topical_index | 2 | 2 | 1 | 1 | 0 | 0 |
| reformed | commentary | 53 | 1 | 0 | 1 | 0 | 0 |
| reformed | confession | 2 | 0 | 0 | 0 | 0 | 0 |
| reformed | devotional | 3 | 2 | 0 | 2 | 0 | 0 |
| reformed | historian | 1 | 0 | 0 | 0 | 0 | 0 |
| reformed | hymn | 1 | 1 | 0 | 1 | 0 | 0 |
| reformed | sermon | 7 | 4 | 1 | 3 | 0 | 0 |
| reformed | theology | 80 | 3 | 0 | 3 | 0 | 0 |
| restoration | commentary | 3 | 1 | 1 | 0 | 0 | 0 |
| restoration | theology | 2 | 0 | 0 | 0 | 0 | 0 |
| unassigned | commentary | 1 | 25 | 4 | 20 | 1 | 0 |
| unassigned | confession | 1 | 10 | 1 | 7 | 2 | 0 |
| unassigned | devotional | 0 | 4 | 0 | 4 | 0 | 0 |
| unassigned | father | 0 | 20 | 16 | 4 | 0 | 0 |
| unassigned | historian | 3 | 27 | 27 | 0 | 0 | 0 |
| unassigned | hymn | 8 | 27 | 0 | 27 | 0 | 0 |
| unassigned | lexicon | 0 | 10 | 0 | 10 | 0 | 0 |
| unassigned | poetry | 0 | 3 | 0 | 3 | 0 | 0 |
| unassigned | sermon | 1 | 6 | 6 | 0 | 0 | 0 |
| unassigned | theology | 56 | 62 | 62 | 0 | 0 | 0 |
| **TOTAL** | | **917** | **265** | **133** | **129** | **3** | **0** |
