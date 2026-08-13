# Corpus backlog — the nine rulings that unblock everything

**Written 2026-08-13. RULED 2026-08-13 — see the rulings block at the bottom.** Companion to the corpus-backlog plan (v2). This sheet batches every
pending owner call in the ingestion/corpus backlog so each is ruled once, in one place, with
the measured evidence attached. Per bylaw 1, a ruling recorded here exists; a ruling given in
a chat window does not.

**Nothing in this document authorises a production connection or a database write.** Every
execution step below still needs the owner's ⚑ go per occasion (`AGENTS.md`), runs through the
proven runner scripts, snapshots first, and records an exact inverse. This sheet decides
*what*; the gates decide *when*.

**How to rule:** each decision lists options with a recommendation. Reply per number (e.g.
"1: yes, 4: b, 9: a") and the reply is recorded against this file.

---

## 1. calvin-crosswire — confirm deletion of the config block

**State (measured):** Shelved by owner ruling 2026-08-11, recorded in
`ingest/sources.config.json`: *"we will find it later."* Already withdrawn from published
(status → staged, 5,088 served rows unserved). The config's own note names the close-out:
*"re-shelving means deleting this block, not another flip."* Calvin remains served by the
calcom volumes. The 1,125 biblehub flat rows are E3 inventory (decision 8). The 2 clean
`books.google.com` rows are unserved and command-ready for serve-or-quarantine (exact 2-row
SQL + inverse already in the runbook) — deleting the block implies **quarantine** for them.

**Recommendation: yes — delete the block, quarantine the 2 clean rows with it.**

## 2. spurgeon-talks-to-farmers — confirm kill-now, re-upload-later

**State (measured 2026-08-11):** Published 2026-08-02 with 298 sections but **embeddings were
never generated — 0 vectors on dev and prod** — so it sat on the shelf unreadable by any
retrieval path. Withdrawn to staged. Owner ruling 2026-08-11: *"kill it — we will upload it
later."* Re-upload means a fresh ingest WITH embeddings, then this block would have been
deleted anyway.

**Execution shape:** delete the staged source row + 298 sections on dev and prod (snapshot +
exact-inverse SQL to evidence), delete the config block. No embeddings, no serving state, no
other tables touched.

**Recommendation: yes — delete now.**

## 3. bramley-carols — terminal exclusion

**State (measured, A6 run 2026-07-17):** No clean-text source exists. CCEL serves an HTML
landing page (no ThML); all 5 archive.org copies are engraved-music editions at 27–31%
OCR-garbage lines (guardrail is >5%), engraved titles unrecoverable. This is not a parser
problem; there is nothing to parse.

**Recommendation: yes — delete the entry and record it in `ACQUISITION_MANIFEST.md`'s
hard-exclusion list (§4d) with the A6 measurement as the reason, so nobody re-attempts it.**

## 4. geneva-notes-crosswire — find a licensed edition, or exclude

**State (measured 2026-07-16, fail-closed since):** the CrossWire module's `.conf` has **no
DistributionLicense** and the module page lists it as null — no license grant to rely on. The
text is 1599 (PD-in-fact), but the repo's rail is that licensing fails closed; age is not a
grant. Old biblehub-collapsed rows are already quarantined to `data/quarantine/`, never
served.

**Options:**
- **(a)** Rule PD-in-fact acceptable. *Not recommended* — it sets the precedent that "old"
  substitutes for "licensed", which is the rail the whole corpus stands on.
- **(b)** Re-source from a licensed PD edition (e.g. a Wikisource transcription with an
  explicit license), ingested fresh under Phase 3's pipeline. *Recommended.*
- **(c)** Terminal exclusion, same treatment as decision 3.

**Recommendation: (b), falling back to (c) if no licensed edition surfaces.**

## 5. The four backfill-skip entries — re-ingest or quarantine, per entry

**State (measured 2026-07-28 on a fresh prod fork, SECTION_PROVENANCE_DESIGN §2):** for each
entry below, **ALL** flat rows under its author string are biblehub's — the named permitted
edition was never actually ingested, so there is nothing clean to slice:

| entry | flat rows | named edition |
|---|---:|---|
| barnes-crosswire-nt | 1,300 | CrossWire module (note: the author string "Barnes' Notes" is shared with the quarantined barnes-notes — slicing here would relabel quarantined content) |
| scofield-crosswire | 1,215 | CrossWire module |
| pnt-crosswire | 288 | CrossWire module |
| poole-tcp | 1,308 | TCP transcription |

Each entry's config note says the same thing: nothing is written until the owner rules
**re-ingest from the named edition** or **quarantine the entry**. scofield/pnt/poole are the
three "inert orphans" of the A9 census (2,811 rows, 0 served); their biblehub rows are E3
inventory under decision 8 regardless of which option is picked.

**Recommendation: re-ingest all four** — each names a permitted edition that simply was never
fetched; Phase 3's fetcher/match-test pipeline does the work. Quarantine is the fallback for
any whose named edition turns out not to exist or not to be licensed (geneva-notes is the
cautionary example — verify each `.conf` *before* ingest, not after).

## 6. Historian lane — build it or rule it closed

**State:** `web/src/lib/teacher/routing.ts:135-138` records this as an open owner decision:
historians have a catalog shelf and a Book Reader path (published-gated) but **no retrieval
lane** — served-as-shelf, unserved-as-retrieval. One published historian work sits in this
state today (the "published-with-no-lane" instance the 2026-08-12 census surfaces).

**Options:**
- **(a) Build the lane** — add `SERVED_HISTORIAN_WORKS` to routing.ts (the publish-admission
  test derives from that file, so census/flip tooling picks it up automatically), add the
  retrieval predicate + FTS-exclusion leg, owner-executed `served` flip. *Recommended if
  historians are meant to answer on /ask*; the acquisition manifest (§5, Tiers 2–3) plans
  more of them, so the lane gets used.
- **(b) Rule shelf-only** — historians stay readable but never answer; the routing.ts comment
  is amended from "open owner decision" to the ruling, and the manifest's §5 tiers are
  re-scoped accordingly.

**Recommendation: (a).**

## 7. TCR (Thompson Chain Reference) — authorise the PD verification

**State:** raw archived under `data/raw/topical/` with sha256s, never ingested. The PD basis
is CrossWire's 1934-non-renewal claim, which is **unverified** — an unverified non-renewal
claim is exactly the fail-closed case.

**Execution shape if authorised:** check the Stanford Copyright Renewal Database (and the
copyright office records if Stanford is ambiguous) for the 1934 registration and its renewal
window (~1961–1962). Verified-renewed → TCR stays archived and joins the manifest's
hard-exclusion list with the citation. Verified-non-renewed → ingest proceeds in Phase 7 with
the verification recorded as the license record.

**Recommendation: yes — authorise the lookup.** It is the cheapest item in the whole backlog
(raw already on disk) and the only thing it costs is the check itself.

## 8. E3 bulk deletion — the 67,710 unserved forbidden rows

**State (re-measured 2026-08-12, WORKLOG "E3 re-measured"):** the 2026-07-27 fear — "deletion
drops 580 verses below the ≥2-author floor" — is **moot for the bulk of the forbidden rows**.
67,710 of the 71,884 forbidden flat rows are already `served=false`: **they serve nothing
today, so deleting them changes nothing live.** The coverage census baseline
(`evidence/corpus-copy/coverage-baseline-2026-08-08.json`) was measured with them already
unserved; the orphan works are verified 0-served. This bulk includes wesley-crosswire's 1,021
held rows, calvin's 1,125 (decision 1), and the three inert orphans' 2,811 (decision 5).

**Execution shape:** owner-gated session, pre-delete snapshot, exact-inverse script, and a
post-delete census re-measured against the 2026-08-08 baseline — the expected delta is zero on
every serving number, and that expectation is stated here *before* the run so a non-zero
delta is a STOP, not a surprise.

**Recommendation: yes — schedule as Phase 6a, no re-sourcing wait.**

## 9. A9 / ADR-044 — the 4,174 served forbidden rows

**State (re-measured exactly 4,174 on 2026-08-12, T0-c):** Chrysostom 2,515 + Augustine 1,659,
`historicalchristian.faith` provenance, `served=true`. This is the live exposure E3 was
always actually about, and it has come up three times without a ruling (A9, ADR-044, T0-c).
The stated remedy gate was a held-out eval whose blocker was a missing API key — **that
blocker is stale: the key is in `web/.env.local` now, so the eval can run.**

**Options:**
- **(a) Unserved-and-hold, eval decides** — owner-executed `served=true → false` flip now
  (snapshot + inverse; Chrysostom/Augustine remain served by their other admitted works, so
  the voices do not vanish), then run the held-out eval to decide delete-vs-re-source.
- **(b) Delete after refill** — Phase 3 re-sources coverage first, floor re-measured, then
  delete. Slower; the rows keep serving forbidden provenance in the meantime.
- **(c) Re-source in place** — Chrysostom/Augustine texts off Schaff ANF/NPNF PD editions via
  Phase 3's match test; provenance-repair where text matches, re-embed where it differs.

**Recommendation: (a) now** — it zeroes the live exposure in one reversible flip, and the
eval then chooses between (b) and (c) with evidence instead of anxiety.

---

## After the rulings

| Ruling | Unblocks |
|---|---|
| 1, 2, 3 (±4c) | Phase 1 cheap kills — quarantine count 9 → ~5 |
| 4b, 5 | Phase 3 re-source work items |
| 6a | Phase 5 historian lane build |
| 7 | Phase 7 TCR ingest (or exclusion) |
| 8 | Phase 6a bulk deletion |
| 9 | Phase 6b flip + held-out eval |

Independent of this sheet: Phase 2 (91-work embeddings backfill) needs no ruling and can
start immediately; Phase 4 (donne/herrick, whitefield, thayers profiles) is build work with
acceptance tests already specified in the plan.

---

## Rulings — 2026-08-13

Owner directive in session, verbatim: **"ok run it all now"** — adopting every recommendation
on this sheet. Recorded here per bylaw 1:

| # | Ruling |
|---|---|
| 1 | **Yes** — delete the calvin-crosswire block; the 2 clean books.google rows quarantine with it |
| 2 | **Yes** — delete spurgeon-talks-to-farmers now (staged source + 298 sections, dev and prod); re-upload later is a fresh ingest |
| 3 | **Yes** — bramley-carols terminal exclusion; recorded in ACQUISITION_MANIFEST §4d |
| 4 | **(b)** — re-source geneva-notes from a licensed PD edition; terminal exclusion (c) if none surfaces |
| 5 | **Re-ingest all four** (barnes-crosswire-nt, scofield-crosswire, pnt-crosswire, poole-tcp) from their named editions, each `.conf`/license verified BEFORE ingest |
| 6 | **(a)** — build the historian lane |
| 7 | **Yes** — TCR PD verification authorised (Stanford renewal database, then copyright office if ambiguous) |
| 8 | **Yes** — E3 bulk deletion of the 67,710 unserved forbidden rows, no re-sourcing wait (Phase 6a) |
| 9 | **(a)** — unserved-and-hold the 4,174 ADR-044 rows now; the held-out eval decides delete-vs-re-source |

Execution per the plan (v2): each production or database step still runs as its own ⚑
occasion with snapshot and exact inverse, evidence under `docs/evidence/`, and the 6a
post-delete census must match the 2026-08-08 baseline with **expected delta zero on every
serving number** — a non-zero delta is a STOP.
