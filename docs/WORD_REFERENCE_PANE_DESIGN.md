# /word reference articles — the smallest slice (2026-08-21)

**Owner ruling:** "do it and then ship them" — wire the held reference works into
`/word/[strongs]` and ship. Follows the lexicon quality pass
(`docs/evidence/lexqa-2026-08-21/README.md`): all five held works are serve-quality;
BDB and Thayer's carry the Strong's key **in the section heading**.

## The slice

One public API route + one page section. Nothing else.

- **`GET /api/word/[strongs]/articles`** — validates the key (`^[GH]\d{1,4}$`, case-folded),
  then: `sections JOIN sources ON source_type='lexicon' AND status='published'` with
  `heading = $key OR heading LIKE $key || ' %'` (the trailing space stops `H43` matching
  `H430`). `publicReadThrottle` like the other public read routes; `LIMIT 20`; returns
  work-attributed rows `{work:{slug,title,author,license}, heading, body, ordinal}`.
  **Serving stays DB-gated**: articles appear only for `status='published'` works, so the
  owner's flip is what lights them, and quarantine kills them instantly — no static extraction
  that would bypass the licensing rails.
- **The page section** — "From the reference shelf", between the concordance and the roadmap
  strip: each article renders quoted + attributed (Author — Title header; BDB's CC BY rides
  the same attribution), long bodies clamp with an expander, BDB's internal bracket codes
  (`[p.cj.ai]`) strip from the displayed heading only. The existing "coming" strip renders
  ONLY when no articles came back — no hand-maintained list of what's missing (the watchlist
  class).

## Index honesty (named, not hidden)

The query's indexed filter is the `sources` join (a handful of lexicon source_ids via
`UNIQUE(source_id, ordinal)`); `heading` is a residual filter over those works' rows (~15K for
BDB+Thayer's). Measured on dev before ship; if it ever needs more, an expression index on the
extracted heading key is a one-line migration — deliberately NOT shipped speculatively.

## What lights up when

- **The wiring ships now** (this slice): the section renders empty-quietly everywhere until…
- **The owner's flip** (`scripts/publish-flip.mjs`, owner terminal, prod): the FIVE works
  (bdb, easton, isbe, nave, smith) go `staged → published` — BDB articles appear on `/word/H*`
  and all five enter lexicon search. Flip list + dev dry-run prepared by this slice.
- **Thayer's follows separately**: prod-state check first (the healthy 08-13 re-ingest
  postdates the dev reset; prod may hold the dead OCR copy), owner quarantine-record lift, a
  chunking decision for its 34K-char entries — then the same one-work flip lights `/word/G*`.

## Out of scope

Topic surfaces for Easton/Smith/ISBE/Nave (they serve via lexicon search on flip; a topic page
is its own design); Thayer's re-copy mechanics; any /ask exposure (the register wall keeps
lexicons out of the exegetical pool — unchanged).
