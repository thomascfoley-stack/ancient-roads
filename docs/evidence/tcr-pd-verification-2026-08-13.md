# TCR (Thompson Chain-Reference) — PD verification, 2026-08-13

Corpus-backlog decision #7 (RULED 2026-08-13) authorised this lookup. Raw text archived at
`data/raw/topical/` with sha256s since the topical ingest prep; never ingested, pending this.

## The claim under test

CrossWire's TCR module page
(https://crosswire.org/sword/modules/ModInfo.jsp?modName=TCR): Frank Thompson's 1934 "The New
Chain-Reference Bible", **copyright May 24 1934, US registration A72501; not renewed; public
domain 1962**. A 1934 registration falls due for renewal in its 28th year (≈1961–1962).

## What was checked

1. **Stanford Copyright Renewal Database** (the standard tool for 1923–1963 works; built from
   the Catalog of Copyright Entries renewal records), queried 2026-08-13 via its JSON API:
   - `q=A72501` → **0 records** (no renewal for the 1934 registration).
   - `search_title="chain-reference Bible"` → **exactly 1 renewal in the entire database**:
     `R190120` — "The new Chain-reference Bible. 2d rev. ed", original registration **A12508**,
     pub 3Sep29 (the **1929** edition), renewed 19Apr57 by B. B. Kirkbride Bible Co., Inc.
     No renewal exists for the 1934 edition or any later Chain-Reference edition.
2. **Web search for `A72501`** — the only hits are the CrossWire claim itself and one
   downstream republisher (Bible-Discovery) repeating it verbatim; **no renewal record
   anywhere** contradicts it.

## Corroborating pattern

The claimant (Kirkbride) demonstrably knew how to renew and did so for the 1929 edition in
1957 — and no renewal appears for the 1934 edition in the window it would have been filed.
This is the affirmative-evidence pattern copyright researchers treat as meaningful: the
database that contains their 1957 renewal would contain a 1962 renewal if one existed.

## Residual risk, stated plainly

Stanford's own disclaimer (echoed on CrossWire's wiki): the database has known omissions, and
**not finding a renewal does not prove PD** the way finding one proves non-PD. The definitive
check — page-reading the 1961–1962 CCE renewal volumes (archive.org scans) — was NOT
performed. The evidence above is the same standard Project Gutenberg applies
(registration identified + no renewal in the renewal records), but this repo's rail is
fail-closed, so this file records the residual rather than hiding it.

## Verdict

**Evidence supports non-renewal; no contradicting record exists.** Recommendation: proceed
with ingest, this file as the license record. One-line owner confirmation requested before
ingest because the CCE page-check residual remains open.

Also noted in passing: the renewed 1929 edition (A12508) itself entered the public domain
2025-01-01 (95 years from 1929) — but the raw we hold is the 1934 edition, so the 1934
non-renewal is the operative claim either way.
