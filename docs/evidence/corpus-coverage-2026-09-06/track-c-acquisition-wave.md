# Track C — acquisition wave evidence (2026-09-07)

Track C of `KIMI_ORDER_corpus-coverage.md` §4. Executed on `fix/ux-overnight-sweep` in
`~/Projects/ap-ingest`, dev branch only (`DATABASE_URL` from `~/.neon_dev_owner_url`,
`NEON_BRANCH=dev`). No prod connection. No publish flips. Track start 2026-09-07T02:59Z.

## Candidates: selected and dropped

Candidate pool = Track B's genuine-gap list (`acquisition-delta-b2.md`), every entry
re-probed against `ingest/sources.config.json` 2026-09-07 (substring probe over slug/
author/title — all confirmed gaps; `gerhard` matches only Paul Gerhardt the
hymnwriter, `bullinger-apocalypse` is E.W. Bullinger, `jowett-brooks` is J.H.
Jowett — the documented traps).

Constraint applied next: **acquirable via the ccel or gutenberg adapter only**, from
a neutral host, clean on the §4 translation trap.

| Candidate | Verdict | Why |
|---|---|---|
| **Richard Hooker, *A Learned Discourse of Justification*** | **ACQUIRED** (`hooker-just`, CCEL `hooker/just`) | Anglican (§4c weighting); d. 1600, original English — no translation trap |
| Richard Hooker, *Of the Laws of Ecclesiastical Polity* | **DROPPED at fetch** | CCEL `hooker/reform1`, `reform2`, `reform3` are ALL scanned page images — every `<p>` holds only `<img alt="Image of page N">` (the spurgeon-treasury trap; verified in the fetched ThML). reform2 was manifest-declared, the loop dry-run showed the parse, live run returned `parse: 1/1 named volumes parsed to 0 sections`; entry removed, nothing written to the DB (verified: no hooker-reform2 sources row). Keble-1888 archive.org lane recorded in the design note |
| Thomas Brooks / William Perkins / Jeremiah Burroughs / Thomas Goodwin | DROPPED | No CCEL author page (404 ×3; `goodwin` on CCEL is William W. Goodwin's Greek grammar, a different person); no Gutenberg ebooks (search 2026-09-07). Their clean free texts live on monergism (**forbidden provenance**) or archive.org (out of scope) |
| Johann Gerhard, *Sacred Meditations* (Heisler 1896) | DROPPED | Host check: archive.org/Google Books/HathiTrust only — no CCEL, no Gutenberg. Archive lane → design note |
| Zwingli, *Latin Works* | DROPPED | archive.org only (1901–29 translations); CCEL has no Zwingli book |
| Heinrich Bullinger, *Decades* / Tyndale, Works | DROPPED | Parker Society = archive.org → design note |
| G. Campbell Morgan | DROPPED | CCEL author page lists no works; Gutenberg search "No records found"; archive.org pre-1930 only → design note |
| Octavius Winslow | DROPPED | No CCEL/Gutenberg; clean texts are Grace Gems — not on the neutral-source list; host policy says stop, so dropped |
| Cornelius a Lapide / Wycliffe | DROPPED | archive.org → design note |
| Rawlinson, *Seven Great Monarchies* | DROPPED | Gutenberg has it — as 7 separate volume ebooks (16161–16167), exceeding the 6-entry cap for one work; §5 historian (no read path by design), not §4 tradition-widening |
| Ramsay / Milman / Mosheim / Schürer / Conybeare & Howson / G.A. Smith / Sayce / Cave | DROPPED | Gutenberg "No records found" (Ramsay checked) or archive.org OCR; all §5 historians with no read path |

**Wave total: 1 manifest entry (cap 6), 13 sections (ceiling 40,000), ~0.15 MB fetched
(ceiling 400 MB), ~35 min (ceiling 3h).** The cap is a ceiling, not a target; the
order's own §1 warns volume is not the deliverable (P4.n).

## Per-work evidence — hooker-just

- **Manifest entry** (`ingest/sources.config.json`): license `Public Domain`;
  `provenance.url` = https://www.ccel.org/ccel/hooker/just; `provenance.edition` =
  "A Learned Discourse of Justification (preached 1585/86; original English, no
  translation)…"; `provenance.year` = 1586; `year_basis` authorDeathUpperBound;
  `licence_basis` authorPre1930; `provenance.acquire.adapter` = ccel ✓ (loop does
  not skip it); no `backfill.match_author` (manifest-provenance invariant safe).
- **License/edition:** Hooker d. 1600, original English — the §4 translation trap
  does not apply (no translator); authorPre1930 by two centuries. §4d exclusions
  checked: Hooker is not one. No ⚠ AVOID entry in §4a/§4c covers him.
- **Proof of edition (a) — first 800 chars read** (from the staged DB sections,
  ordinal 1): the document IS *"A Learned Discourse of Justification, Works, and how
  the Foundation of Faith is Overthrown by Richard Hooker"* — the Habakkuk 1:4
  sermon ("The wicked doth compass about the righteous; therefore perverse judgment
  doth proceed."). CCEL's prepended modern editorial introduction (James Kiefer)
  was dropped at ingest as front matter (MATTER_RE "Introduction"). 13 sections:
  the discourse + its 12 doctrinal sections (headings: DOCTRINAL DISAGREEMENT,
  SANCTIFICATION, THE SALVATION OF "OUR FATHERS", … ERROR AND HERESY NOT ALWAYS
  IDENTICAL).
- **Proof of edition (b) — shingle text-match** to a clean PD reference: Keble
  1888 ed. vol. 3 (archive.org `worksofthatlearn03hookuoft`, whose own editorial
  footnote dates the sermon to "the first year of Hooker's mastership of the
  Temple" = 1585/86). Computed with the SHIPPED `shingleSet`/`containment` from
  `src/ingest/resource-textmatch.ts` (gate R5's own measure):
  **shingleSet(n=4) containment = 76.9% ≥ 70% floor** (staged 117,939 chars within
  the Keble OCR); OCR-tolerant 3-gram variant (`shingleHashSetOcr`, same module)
  = **85.2%** (16,075/18,871 shingles).
- **Loop outcome** (`docs/evidence/ingest-runs/digest-2026-09-07T03-14-43-002Z.md`):
  **staged** — 13 units · 13 anchored · 122 embedded (flat store). DB:
  `sources.status='staged'`, 13 `sections`, 122 `embeddings`
  (`sermon:hooker-just:*`), tradition `anglican`, license `Public Domain`.
  publish flag never set.
- **Detector (ADR-029 attribution boundary):** NO hold — the work passed the
  boundary (0 strong findings; the Kiefer introduction is removed by MATTER_RE
  before the sweep). Detector holds this wave: 0 of 1 (the >50% stop rule not
  triggered).
- **Anchors:** all 122 chunk anchors are the source's own first-scripRef anchors,
  decoded and verified sane (books 35–66, single verses, chapter ≤ 28, no v1-999
  sentinels). No verse ids invented.
- **R1 closed:** `node scripts/backfill-section-embeddings.mjs --env=dev
  --only=hooker-just --apply` → 13/13 section_embeddings written, 0 failures
  (log: `docs/evidence/embeddings-backfill/dev-run-<ts>.log`). The script needed a
  minimal additive extension (`--only=<slug>` + honoring an exported DATABASE_URL;
  documented in its header) — it previously covered published works only and could
  not see a staged slug.
- **Gate R3 for my author — STOP-AND-REPORT per the order:** R3
  count-parity(static↔db) went from `+674 more` (baseline) to `+675 more` (after);
  the +1 is `Hooker, Richard: static 13 ≠ db 0` — the structural register-path class
  the order itself predicts ("nothing writes commentary_entries, so R3 count-parity
  goes red"): register-writer wrote 13 static entries and 0 `commentary_entries`
  rows. Acquisition is stopped (the wave is complete at 1 work); the staged rows
  are left in place (deleting corpus to duck a gate is a prohibited remedy; staged
  rows serve nothing).

## Gate: baseline vs after (bar = no NEW red line)

Commands (both with dev env exported):
```
corepack pnpm gate:ingest   # baseline: gate-baseline.log (BEFORE any write)
corepack pnpm gate:ingest   # after:    gate-after-track-c.log
```

Both runs: `0 irreversible + 5 reversible gate(s) failing`. Line-by-line diff:

| Check | Baseline | After | Δ |
|---|---|---|---|
| L1 license-manifest | ✓ (917) | ✓ (918) | +1 entry, green both |
| L3 served-provenance | ✓ (163,768 static) | ✓ (163,781) | +13 static, green both |
| L4 staged-source-provenance | ✓ (262) | ✓ (263) | +1 source, green both |
| R1 coverage-commentary | ✗ 64,344 | ✗ 64,344 | identical |
| R1 coverage-sections | ✗ 6,184 | ✗ 6,184 | identical (13 new sections backfilled) |
| GATE A (sections) | ✗ 6,184 | ✗ 6,184 | identical |
| R2 verse-keys(corpus) | ✓ | ✓ | green both |
| R3 count-parity(static↔db) | ✗ +674 more | ✗ +675 more | **+1 = Hooker (see above — reported, structural)** |
| R3 count-parity(staged work) | ✗ 6 works | ✗ same 6 works | identical (hooker-just has no backfill.match_author → not in this check) |
| R4 content-sanity(sampled) | ✗ (11 sampled) | ✗ (8 sampled) | same red line; different random reservoir sample (mulberry32 seed walks the growing static corpus); Hooker appears in neither, and my anchors were independently verified sane above |

**Verdict: no new red line; the one count growth (R3 +674→+675) is the order's own
predicted register-path R3 class, stopped-and-reported as instructed.**

## Manifest invariants

`corepack pnpm exec vitest run test/invariants/source-archive-coverage.test.ts
test/invariants/manifest-provenance.test.ts
test/invariants/served-lists-respect-the-manifest.test.ts` → **25/25 passed**
(3 files). The hooker-just entry carries `acquire.adapter: ccel` with explicit
`ccel_ids` (archive-derivable), no `backfill.match_author`, and is in no served
list.

## Suite status (`corepack pnpm run audit`, 2026-09-07T03:4xZ)

AUDIT FAILED (4 legs) — **all four pre-existing, none attributable to this diff**:

| Leg | Failure | Why it is not this diff |
|---|---|---|
| typecheck — cutover gate (scripts/) | `scripts/adr029-nonauthorial-scan.mts(87,41)` TS2345 | Track A's committed file (ce3df1b), untouched by this track; error reproduces from the committed code |
| deps — advisory bulk-endpoint | 4 high `fast-uri` GHSAs (5jgf-p345-68v8, f65p-4m7j-42xc, fph4-wmhf-6fwf, jqff-g426-hqxp) | advisory-DB drift; this diff adds no dependency and touches no manifest/lockfile |
| qa — Layer 1 | 7 tests in `test/invariants/studies-tenancy.test.ts` + `annotation-rls-tenancy.test.ts` (RLS tenancy over app_runtime on dev user tables) | user-data RLS state on dev; the diff touches corpus ingest only |
| hygiene — no test residue | 2 seeded rows each in dev bookmarks/notes/user_documents (qa-/rls- prefixes) | seeded by the same failing qa tenancy runs, per the gate's own message |

Green legs: root/web typechecks, lint ×2, knip, **vitest + coverage (full root suite)**,
deploy.sh harness, Gate B license, and the env allow-list. The three order-named
manifest invariants pass 25/25 (see above). The Track C gate bar (no new red vs the
committed gate:ingest baseline) is met independently of the pre-existing audit legs.

## Reproduction (for the independent audit)

1. Baseline bar: `diff docs/evidence/corpus-coverage-2026-09-06/gate-baseline.log
   docs/evidence/corpus-coverage-2026-09-06/gate-after-track-c.log`
2. Loop digest: `docs/evidence/ingest-runs/digest-2026-09-07T03-14-43-002Z.md`
3. Staged rows: `psql "$DATABASE_URL" -Atc "SELECT slug,status,source_type,tradition,
   license FROM sources WHERE slug='hooker-just'"`
4. Edition proof: first-800 = `SELECT left(body,800) FROM sections … slug='hooker-just'
   ORDER BY ordinal LIMIT 1`; shingle = shipped `shingleSet`/`containment` over the
   staged bodies vs `worksofthatlearn03hookuoft_djvu.txt` (archive.org download).
5. reform2 page-image finding: `curl -sL https://www.ccel.org/ccel/hooker/reform2.xml
   | grep -c 'Image of page'` (every chapter div holds only `<img>` page refs).
