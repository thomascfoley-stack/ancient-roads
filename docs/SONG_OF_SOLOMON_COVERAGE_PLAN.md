# Song of Solomon coverage — the embeddings plan (2026-08-11)

Owner direction 2026-08-11: *"Song of Solomon, lets either rebuild or patch, get that one
done — lets establish the database embeddings plan, then loop back to ensure it gets done."*

This is the plan. Everything in §1 is measured on dev (prod mirror, 2026-08-11).

## 1. Measured state — the hole is CONTENT, not staleness

- `verse_coverage` for the book (22,117 verses): **5 verses covered**, max 2 authors on one
  verse; table last computed 2026-08-03 (pre-CCEL-wave).
- Exegetical anchors today (`section_anchors`, published, commentary+father — the gate's
  admitted types, ADR-045): **ryle-expository 1 verse, NPNF fathers 5 verses / 7 anchors**.
  Even after a `verse_coverage` rebuild: ~6 verses, ~1 author. A rebuild changes nothing
  that matters.
- There is **no existing Song commentary to anchor**: matthew-henry 0 body mentions,
  john-gill 0, adam-clarke 3 (cross-references), jfb 5 (cross-references),
  keil-delitzsch 3 (cross-references). The whole-Bible commentaries in this corpus simply
  lack Song sections — so "patch" (anchor backfill) has nothing to patch onto.
- What the corpus already has on the Song (NOT exegetical — feeds lanes/surfaces, not the
  ≥2-voice floor): spurgeon-sermons 551 served verse-keyed rows, topical indexes 478
  anchors (Torrey/OpenBible/Nave), devotionals ~92, hymns 15.
- The gate: Plans refuses a scope when fewer than half its reading days reach ≥2 admitted
  exegetical authors (ADR-045); `web/test/regression/plans-routes.test.ts` pins Song of
  Solomon as exactly that refused case.

**Side-finding for the ingest lane (not counted on):** ryle-expository's 21 served rows
keyed to the Song contain non-Ryle content ("CHAPTER XV. THE LORD'S GARDEN") — Ryle wrote
on the Gospels only. Reads as the old author-page contamination class. Flagged; the work
is not used in this plan's arithmetic.

## 2. The plan

1. **ACQUIRE (owner picks the second voice).** First pick: **Gill, *Exposition of the Book
   of Solomon's Song*** (CCEL, PD — Gill is already an admitted exegetical voice;
   verse-by-verse). Second voice, one of: **JFB on the Song** (admitted voice, CCEL),
   **Matthew Henry on the Song** (admitted voice), or **Bernard of Clairvaux, *Sermons on
   the Song of Songs*** (father register — would also deepen the father lane).
   Recommendation: **Gill + JFB** — two authors already admitted to the exegetical pool,
   so the coverage they produce counts immediately on publish.
2. **INGEST via the standard loop** (adapter → license/provenance gate → sections WITH
   verse anchors → embeddings), staged, never served before the owner flip. The embed step
   is paid DeepInfra spend — owner go before it runs.
3. **PUBLISH flip** (owner, `scripts/publish-flip.mjs`, TTY gate) → `embeddings.served`.
4. **REBUILD `verse_coverage`** (`scripts/rebuild-verse-coverage.ts`; dev first, then prod
   with `COVERAGE_ALLOW_PROD=1`).
5. **VERIFY + flip the pinned test.** Song coverage ≥2 admitted authors on the gate's share
   of verses; the plans-routes expectation flips from "refused with a stated reason" to
   accepted — the test change ships with its red-proof (watched red before the flip).
   §B1 and the register wall are untouched (commentary register, no new lane).

**Rollback:** `--reverse` flip from the forward snapshot returns the works to staged;
`verse_coverage` is a derived rollup and is rebuilt, never hand-edited.

## 3. Loop-back checkpoints

(a) owner acquisition ruling (this doc §2.1) → (b) ingest staged, Gate B green, anchors
measured → (c) owner flip → (d) coverage rebuilt, Song numbers recorded in WORKLOG →
(e) plans-routes flip + full audit green.

Settled when: `verse_coverage` for the book reads ≥2 authors on ≥50% of verses, a plan
scoped on the Song is ACCEPTED by the coverage gate, and the audit is green with the
flipped expectation.
