# Section provenance — closing the E4 laundering path

**Status:** DESIGN ONLY — **not implemented.** The measurement in §2 is real (fresh prod fork); §4–§5
describe what *would* ship. Implementation touches `migrate-sections-slice.ts`, the cutover
orchestrator and the regression gate, which the 2026-07-28 ingest work order puts behind the owner
("anything touching the cutover script" waits). Awaiting the owner calls in §7.
**Author:** agent, 2026-07-28 (overnight). **Supersedes nothing; extends** `docs/CUTOVER_DESIGN.md` E4
and `docs/MIGRATION_DESIGN.md` §1.
**Diagnostic that motivated it:** measured on a fresh fork of production
(`lab-e4-provenance-20260728`, parent `production`, created and read read-only) — evidence
`docs/evidence/ingest-2026-07-29/00-e4-provenance-diagnosis.txt`.

---

## 1. The defect, in one paragraph

E4 (`scripts/cutover-e4-slice-all.mjs` → `src/ingest/migrate-sections-slice.ts`) selects flat
`embeddings` rows **by `metadata->>'author'`** and copies `e.content` into `sections.body` under a
`sources` row whose `provenance` comes from `ingest/sources.config.json`. The flat row's own
`metadata->>'sourceUrl'` is **not carried across**. Where the flat pool's real origin is a forbidden
aggregator and the manifest entry declares a clean origin, the copy is **provenance laundering**: the
text lands under a `sources.provenance` that says `crosswire.org` or `textcreationpartnership`, with
no row-level signal that it came from `biblehub.com`. The forbidden-provenance ratchet still counts
the flat rows (they keep their `sourceUrl`), so it stays green while the sections store fills with
unlabelled aggregator text. E3 used to delete those rows before E4 ran; E3 was dropped from the
cutover on 2026-07-27 (ADR-030 correction), so the ordering that hid this is gone.

Nothing is served from `sections` today (`migrate-sections-slice` writes `status='staged'` and none of
the affected slugs is in `SERVED_PROSE_WORKS`), so **this is not a live breach.** It is a loaded gun:
publishing any of those sources later ships forbidden-aggregator text under a clean provenance record
and **no gate can currently see it** — G6's sections-store leg scans `sources.provenance` text only,
which is exactly the field that lies.

## 2. Measurement (fresh prod fork, 2026-07-28)

Per work, the flat pool E4 selects, split by the host-aware `forbiddenProvenanceDomain` predicate —
the SAME predicate the ratchet and `b2-remove-forbidden-provenance` use:

| manifest entry | declared provenance | flat rows | forbidden | % | verdict |
|---|---|---|---|---|---|
| `poole-tcp` | textcreationpartnership | 1,308 | 1,308 | 100% | **all-forbidden** |
| `barnes-crosswire-nt` | crosswire.org | 1,300 | 1,300 | 100% | **all-forbidden** + author collision |
| `scofield-crosswire` | crosswire.org | 1,215 | 1,215 | 100% | **all-forbidden** |
| `pnt-crosswire` | crosswire.org | 288 | 288 | 100% | **all-forbidden** |
| `calvin-crosswire` | crosswire.org | 6,215 | 1,125 | 18.1% | **mixed** (5,088 crosswire, 2 books.google) |
| `wesley-crosswire` | crosswire.org | 6,275 | 1,021 | 16.3% | **mixed** (5,254 crosswire) |
| `john-gill` | helloao | 28,843 | 0 | 0% | clean (sourceUrl NULL) |
| `jfb` | helloao | 15,473 | 0 | 0% | clean |
| `adam-clarke` | helloao | 12,693 | 0 | 0% | clean |
| `matthew-henry` | helloao | 4,210 | 0 | 0% | clean |
| `keil-delitzsch` | helloao | **0** | 0 | — | **not on prod at all** (see §8) |

**6,257 rows** would be copied into `sections` with their provenance erased. Whole-pool ratchet on the
same fork: 71,884.

Two facts the table makes plain and the prose above did not:

1. **Four works are 100% forbidden.** `poole-tcp` / `scofield-crosswire` / `pnt-crosswire` /
   `barnes-crosswire-nt` have *no clean rows at all*. Their manifest entries name CrossWire/TCP
   editions that were never actually ingested — the rows in the database are biblehub's. The manifest
   is not describing this data.
2. **`"Barnes' Notes"` is claimed by two manifest entries** — `barnes-notes` (quarantined, provenance
   `biblehub.com`, honest) and `barnes-crosswire-nt` (not quarantined, provenance `crosswire.org`).
   E2 labels those 1,300 rows `work=barnes-notes`; E4 slices the same 1,300 into
   `barnes-crosswire-nt`. The rows land as sections under **both** sources, and E4's 1:1 drift check
   exempts `barnes-crosswire-nt` because its flat count *under that slug* is 0. Prod already carries
   1,300 `barnes-notes` sections, which is why the last rehearsal's section total was 79,120 =
   77,820 sliced + 1,300 pre-existing. **Relabelling quarantined content into a non-quarantined slug
   is laundering by rename** — the same defect at the manifest level.

## 3. Options considered

**(a) Skip forbidden rows at slice time.** Simple, no schema change, sections store clean by
construction. But: it breaks E4's 1:1 invariant, it silently empties the four all-forbidden works,
and — the real objection — it leaves the store with **no way to prove** it is clean. Absence of a
signal is not a signal. A future writer that bypasses the skip is undetectable.

**(b) Carry per-row provenance onto the section.** Preserves the signal and satisfies ADR-029
addendum 2's rule (*express a cross-store invariant in EACH store's own key*). The ratchet can then
see the sections store directly instead of inferring from `sources.provenance`. Cost: one additive
column. Objection: on its own it *labels* the laundered text rather than refusing it.

**(c) Refuse to slice a mixed-provenance work.** Strongest fail-closed reading of "licensing fails
closed". On its own it aborts E4 for 6 of 10 works and therefore blocks the cutover, and it forces a
content ruling to be made by a script.

**Chosen: (b) as the mechanism, (c) as the default, (a) as the only escape — and the escape must be
declared per work in the manifest.** No single option is right; the failure was that provenance had
nowhere to live in the sections store *and* no policy about what to do when it is bad.

## 4. The design

**R1 — content provenance is carried.** `sections.source_url TEXT NULL` (migration
`031_sections_source_url.sql`, additive). `migrate-sections-slice` copies
`embeddings.metadata->>'sourceUrl'` into it, row for row, through the same window-ordinal join the
body and vector already use. A section now records where its *text* came from, independently of what
its *source* claims.

**R2 — the slice fails closed on undeclared forbidden provenance.** Before writing anything,
`migrate-sections-slice` counts the forbidden rows in the work's flat pool using
`forbiddenProvenanceDomain` (the canonical predicate). If that count is > 0 and the manifest entry
does not declare a policy, it **aborts the transaction** and names the count, the domains, and the two
legal fixes. A new mixed work can never silently launder again.

**R3 — the policy is declared in the manifest, one line per work.**
`backfill.forbidden_provenance` on the entry, with a required `backfill.forbidden_provenance_reason`:

| value | behaviour |
|---|---|
| *(absent)* | **abort** if any forbidden row is present (the default) |
| `"exclude"` | slice only the clean rows; record `excluded_forbidden_rows` + the domains on the `sources` row's provenance; abort if the exclusion leaves **zero** sections (use `skip` instead) |
| `"skip"` | do not create or refresh the source at all; write nothing; E4 records it as an expected skip |

`"exclude"` is always strictly subtractive — it can only remove forbidden-aggregator content — so it
is safe for an agent to apply. `"skip"` likewise writes nothing. **Neither declares the work
legitimate**; the real ruling (quarantine, or re-source from a permitted PD edition) stays with the
owner and is parked in §7.

**R4 — the manifest may not launder by rename.** A new invariant test: a non-quarantined entry that
shares a `backfill.match_author` with a **quarantined** entry must declare
`backfill.forbidden_provenance`. Today that is exactly `barnes-crosswire-nt` vs `barnes-notes`. Two
non-quarantined entries may never share a `match_author` at all.

**R5 — a gate leg that can actually go red: G8.** In `scripts/cutover-regression-gate.mts`:

> **the property:** no section whose *content* provenance is a forbidden aggregator may live under a
> source whose *declared* provenance is clean.

It joins `sections` to `sources`, applies `forbiddenProvenanceDomain` to `sections.source_url` and to
the source's declared provenance, and **fails** (not warns) on any row where the first is forbidden
and the second is not. It also prints a per-source census of section `source_url` hosts, so the
store's actual composition is visible rather than inferred. G6's `sources.provenance` leg stays —
they read different keys and neither subsumes the other.

**Honest limit, stated so nobody reads G8 wider than it is:** G8 can only see provenance that is
*recorded*. `sections.source_url` is NULL for the four clean helloao works (their flat rows carry no
`sourceUrl`) and for every section written by the three other writers of the table
(`ingest-sermon.ts`, `ingest-historian.ts`, `repoint-sections-work.ts`), which ingest from declared-
clean adapters and do not populate it. A writer that introduced forbidden content with a NULL
`source_url` would be invisible to G8 and would have to be caught by `sources.provenance` (G6) or by
the ingest-time licence gate. That gap is real and is named here rather than papered over; closing it
means making `source_url` NOT NULL at ingest, which is the infra/content-separation program, not this
slice.

## 5. What this changes at E4, tonight's numbers

| work | policy | sections written | forbidden excluded |
|---|---|---|---|
| `john-gill` | — | 28,843 | 0 |
| `jfb` | — | 15,473 | 0 |
| `adam-clarke` | — | 12,693 | 0 |
| `matthew-henry` | — | 4,210 | 0 |
| `calvin-crosswire` | `exclude` | 5,090 | 1,125 |
| `wesley-crosswire` | `exclude` | 5,254 | 1,021 |
| `poole-tcp` | `skip` | 0 | (1,308 not written) |
| `scofield-crosswire` | `skip` | 0 | (1,215 not written) |
| `pnt-crosswire` | `skip` | 0 | (288 not written) |
| `barnes-crosswire-nt` | `skip` | 0 | (1,300 not written) |
| `keil-delitzsch` | — | 0 (no flat rows) | 0 |

**Nothing served changes.** Retrieval reads flat `embeddings`; `sections` is not a served store at
this stage, and every slug affected is absent from `SERVED_PROSE_WORKS`. The ≥2-voices floor,
measured corpus-wide by G2, is untouched — this slice writes nothing to `embeddings`.

E4's 1:1 postcondition is therefore restated. It was `sections == flat pool for that work`; it becomes
**`sections + excluded == flat pool`, with `excluded` measured and printed per work**, and an expected
`0` for a declared `skip`. A silent inequality is still an abort.

## 6. Why not just delete the 6,257 rows (i.e. bring E3 back)

Because that is the step the owner dropped on 2026-07-27, for a reason that has not changed: the
cutover has no ingest step, so deleting served rows is a pure subtraction (580 verses below the
≥2-voices floor, 24 losing every voice — measured read-only on prod). This slice deliberately does
**not** touch `embeddings`. It stops the *copy* from erasing provenance; cleaning the flat store
remains the deferred slice that `b2-remove-forbidden-provenance.ts` exists to perform, after the
clean NPNF/CCEL re-ingest lands.

## 7. OWNER CALLS — parked, not decided by me

1. **The four all-forbidden works.** `poole-tcp`, `scofield-crosswire`, `pnt-crosswire`,
   `barnes-crosswire-nt` have manifest entries naming CrossWire/TCP editions and **zero** rows that
   actually came from there. Either the entries are wrong and should be `quarantine`d like
   `barnes-notes`, or the works must be re-ingested from the edition they name. Tonight they are
   `skip` — nothing is written, nothing is lost, and the decision is still yours. One line each in
   `ingest/sources.config.json` flips it.
2. **`barnes-notes` on production** already has 1,300 sections with biblehub provenance, written
   before this slice existed. They are `status='staged'`, unreachable, and the source is *honest*
   (its declared provenance is biblehub), so G8 does not fire on them. Deleting them is a destructive
   op on prod and is yours.
3. **`commentary_entries`** — separate, larger, and **not** created by this slice: 50,618 rows with
   forbidden-aggregator provenance are reachable through the shipped
   `LEGAL_COMMENTARY_ENTRIES_PREDICATE` (deep-audit finding 9, now measured). See the morning report.

## 8. Out of scope, recorded

- `keil-delitzsch` has **0 rows** on production under its `match_author`, although it is in
  `SERVED_PROSE_WORKS`. E4 skips it and every check reads green because the checks key on a count
  that is 0 on both sides. That is a corpus gap, not a cutover defect — recorded here because it was
  found by this measurement and belongs in the ledger.
- Making `sections.source_url` NOT NULL, and giving the other three section writers a provenance
  contract, is the infra/content-separation program.
