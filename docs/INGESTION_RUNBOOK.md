# INGESTION RUNBOOK — one work, end to end

Operator runbook for bringing one source-work (commentary, sermon, historian,
theology, …) from "found a clean text" to "published". Design of record:
`docs/INGESTION_HARNESS_DESIGN.md`; task spec + hard rules:
`docs/INGESTION_TASK.md`. The pipeline target is the `sources` + `sections`
model (**ADR-010 — `sources` + `sections` is the corpus ingestion target**);
sourcing discipline is **ADR-008 — Commentary sourcing: SWORD/CrossWire
primary; never scrape aggregators**.

The loop, in order — every step verified against the scripts in this tree:

```
0. declare (ingest/sources.config.json)
1. acquire (the per-format adapter → status='staged')
2. gate    (corepack pnpm gate:ingest)
3. embed   (corepack pnpm ingest:embeddings)
4. digest  (per-work card for the human)
5. publish (HARD HUMAN GATE — owner only, never an agent)
```

Everything up to `staged` is automatable because staging serves nothing;
publish is legally irreversible and never auto-fires.

## 0. Declare the work — `ingest/sources.config.json`

Add one entry per work. This file is the **per-work provenance + license
registry** — the compliance gate reads it, so it is written *before* ingest,
not after. Shape (array of works; verified against the live file):

```json
{
  "id": "barnes-notes",
  "slug": "barnes-notes",
  "title": "Barnes' Notes on the Bible",
  "author": "Albert Barnes",
  "author_died": 1870,
  "year_written": 1834,
  "source_type": "commentary",
  "tradition": "reformed",
  "era": "modern",
  "license": "Public Domain",
  "provenance": {
    "url": "https://…",
    "edition": "translator/edition string",
    "year": 1834,
    "retrieved_via": "how it was obtained"
  },
  "quarantine": "optional non-empty reason — knowingly HOLD out of publish",
  "backfill": { "match_author": "name the DB rows carry" }
}
```

Mandatory rules (enforced by `src/ingest/license-manifest.ts`, run as gate L1):

- `license` must be one of **Public Domain | CC BY | CC BY-SA**; missing or
  anything else fails closed.
- `provenance.url`, `provenance.edition` (translator/edition), and
  `provenance.year` are all required — the edition-trap guard.
- A provenance host on the forbidden-aggregator list (biblehub, studylight,
  historicalchristian.faith — ADR-008) is a violation unless the entry carries
  a non-empty `quarantine` reason (a deliberate hold, never published).
- The license map is the human-reviewable compliance artifact — get it reviewed
  before backfilling `sources` (`docs/INGESTION_TASK.md` Appendix A hard rails).

## 1. Acquire — run the adapter

One adapter per format. All are idempotent (`ON CONFLICT DO NOTHING`;
a killed job resumes, never double-ingests) and all write `sources`/`sections`
with **`status='staged'`**. All need `DATABASE_URL` + `DEEPINFRA_API_KEY`
(env or `web/.env.local`):

- **CrossWire SWORD commentary:**
  `npx tsx src/ingest/ingest-sword-commentaries.mts <jsonl>`
- **Historian** (ADR-021 contract, see §Historians below):
  `npx tsx src/ingest/ingest-historian.ts --jsonl=<file.jsonl> --slug=<slug>`
- **PD sermon** (Gutenberg-style collections):
  `npx tsx src/ingest/ingest-sermon.ts --txt=<file.txt> --slug=<slug>`

Pipeline discipline per `docs/INGESTION_TASK.md` §2: normalize with one parser
per format → structure on the format's own markup (never blind-chunk when
structure exists) → anchor scripture refs (archaic citation styles are the hard
80% — anchor quality *is* retrieval quality) → chunk 200–800 words on paragraph
boundaries → tag from the per-source config → embed → QA gate.

## 2. Gate — `corepack pnpm gate:ingest`

`tsx src/ingest/gate-ingest.ts`. **Read-only** (no gate writes to the DB), but
it needs `DATABASE_URL` or `DATABASE_URL_UNPOOLED`. Two modes:

- **Corpus mode** (no args): full sweep of the served static corpus + DB.
- **Per-work mode:** `corepack pnpm gate:ingest -- --work=<id>
  --jsonl=<file.jsonl> [--match-author=<name>]` — adds count-parity, per-work
  verse-keys, sanity and text-match for the incoming work.

Gates run **irreversible-first** (license/provenance/must-not-serve — you
cannot un-serve copyrighted text — fail the run even if every reversible gate
is green):

| Gate | Tier | What it asserts |
|---|---|---|
| L1 license-manifest | irreversible | `sources.config.json`: allowed licenses, complete provenance, no un-quarantined forbidden hosts |
| L2 translation-license | irreversible | every `web/public/bible/<id>` dir has a shipping license record (block-by-default) |
| L2b versification | reversible | translation verse maps conform |
| L2b corpus-readable | irreversible | every served chapter file parses (an unscanned file would bypass L3/L5) |
| L3 served-provenance | irreversible | zero forbidden-provenance entries in the served static corpus |
| L4 staged-source-provenance | irreversible | no staged `sources` row carries a forbidden provenance URL |
| L5 must-not-serve | irreversible | no must-not-serve author in served content |
| R1 coverage (commentary + sections) | reversible | zero eligible rows un-embedded |
| R2 verse-keys (work + corpus) | reversible | derived verse-key *distribution* is sane (ADR-020) |
| R3 count-parity (static↔db / work) | reversible | ingested count == source-parse count |
| R4 content-sanity (sampled) | reversible | sampled bodies are real prose, no entity/markup bleed |
| R5 text-match (work) | reversible | shingle-match vs clean PD reference ≥ 70% repair floor |

Exit 0 = every gate green; any red ⇒ nothing may be published.

## 3. The state machine — staged → published

`sources.status` is the QA-gate column: migration **006** created it
(`CHECK (status IN ('staged','published','quarantined'))`); migration **023**
(`023_sources_status_ingesting.sql`) added **`'ingesting'`** — the in-flight
marker a register-writer stamps until a work's write *succeeds*, so a crash
mid-write can never leave a published shell. The full chain
(`docs/INGESTION_HARNESS_DESIGN.md`):

```
discovered → acquired → matched → staged → (digest) → published | quarantined
```

- Only `published` is served; `staged` and `quarantined` serve nothing.
- `quarantined` is reversible (revive if a clean PD source surfaces); nothing
  is deleted.
- Every transition is logged with rationale.

## 4. Embed — `corepack pnpm ingest:embeddings`

`tsx src/ingest/ingest-embeddings.ts` embeds ONE book of the legacy static
commentary corpus into the **flat** `embeddings` table — positional book-slug
arg (`corepack pnpm ingest:embeddings jhn`), no `--slug` flag. It does **not**
embed `sections`: section embedding is inline in the writers
(`ingest-sermon.ts` / `ingest-historian.ts`), or free by vector reuse —
`migrate:sections-slice` for commentary, and `corepack pnpm repoint:sections --
--source=<slug>` for register works already in the flat store. Requires
**`DEEPINFRA_API_KEY`** and **`DATABASE_URL_UNPOOLED`** (falls back to
`DATABASE_URL`), from env or `web/.env.local`; it throws loudly if either is
missing. The embedder is pinned — **`BAAI/bge-large-en-v1.5` (1024-dim)**,
never `bge-m3`, never a mix of models (`docs/INGESTION_TASK.md` hard rules;
`model_slug` is recorded per row). R1 coverage in the gate is how you prove
zero un-embedded sections afterwards.

## 5. Per-work digest — the human touchpoint

`npx tsx src/ingest/ingest-harness.ts --source=<slug>` runs one work end-to-end
to a staged state over the existing adapters and prints the **digest card**:
work + source, license/provenance gate results, match result, and a
`RECOMMENDED:` line — `PUBLISH-ELIGIBLE — awaiting owner digest approval
(NOT auto-published)` or `QUARANTINE/ESCALATE`. **It publishes nothing.**

## 6. Publish — HARD HUMAN GATE

Publish approval *is* the publish authorization, and it belongs to the owner.
There is deliberately **no publish script** in this repo: after approving the
digest, the owner flips `sources.status` from `'staged'` to `'published'`
themselves. An agent never publishes — licensing is legally irreversible, and a
work with a passing license gate is *eligible* for the digest, never
auto-published (`docs/INGESTION_HARNESS_DESIGN.md` autonomy model).

## Historians — ADR-021 rules

**ADR-021 — Historians are born in the 006 model; the write-contract gates
bulk ingest.** For `source_type='historian'` (Josephus first):

- Ingest **only** into `sources`/`sections` — never the flat verse-keyed
  `embeddings` table (fabricating a `verseId` for prose about events is exactly
  the corruption the verse-key repair exists to kill).
- Chunk on the source's **own headings**; embed every chunk **whole**
  (truncation asserted impossible, not merely avoided).
- Entity anchors come from a hand-seeded gazetteer and are written only when
  the label is **verbatim** in the section (curated human fact, never model
  inference); scripture anchors only where the text explicitly cites.
- Land at **`status='staged'` and stay there** — no history read path exists,
  so staged historians are never served until one exists and the owner
  publishes.

## The forbidden-provenance ratchet

`scripts/predeploy-gate.ts` counts forbidden-provenance entries (biblehub /
studylight / historicalchristian.faith) in `web/public/commentaries/` against
the committed baseline `web/test/baselines/static-forbidden-provenance.json`.
The count **may only go down**; the baseline is currently **0**, so *any*
forbidden entry fails the deploy. It runs on pre-commit (when the gitignored
corpus dir exists) and at deploy (`DEPLOYING=1`, via `deploy.sh`). When a
content fix lowers the count, `corepack pnpm qa:baseline` writes the new lower
baseline — commit it. Residual forbidden content is serviced by re-sourcing
per ADR-008, not by editing the baseline upward.

## Common failures (named by the gate that catches them)

- **L1 license-manifest red** — missing `provenance.url`/`edition`/`year`;
  license outside Public Domain | CC BY | CC BY-SA; forbidden-aggregator host
  without a `quarantine` hold; duplicate `id`. Fix the registry entry.
- **L2 translation-license red** — a `web/public/bible/<id>` dir with no
  shipping license record (block-by-default: deny / unknown / no-record all
  block). Remove the dir, add a verified allow record, or set `LICENSE_ACK`
  for a conditional one.
- **L2b corpus-readable red** — a served chapter file that won't parse/shape-
  check; it must be fixed or removed, because an unscanned file bypasses L3/L5.
- **L3 served-provenance red** — forbidden-provenance entries in the served
  static corpus; re-source the content (see the ratchet above).
- **L4 staged-source-provenance red** — a staged `sources` row carrying a
  forbidden URL (the barnes-notes-staged-with-a-biblehub-URL scar). Fix
  provenance before publish.
- **L5 must-not-serve red** — a must-not-serve author present in served
  content.
- **R1 coverage red** — rows/sections not embedded: run step 4, then re-gate.
- **R2 verse-keys red** — the derived-key distribution is off (the
  chapter-number-stored-as-verse scar; **ADR-020 — for a DERIVED key, assert
  the distribution, never the row**). The adapter is the bug, not the data.
- **R3 count-parity red** — ingested count ≠ source-parse count (the
  matthew-henry chunk-duplication catch). Re-run the idempotent adapter; a
  persistent delta means a parser bug.
- **R4 content-sanity red** — mangled text, HTML-entity or markup bleed in the
  sample; inspect the logged sample and fix the normalizer.
- **R5 text-match red** — repair % below the 70 floor against the clean PD
  reference: the edition is wrong, not the flag (biblehub "Calvin" matched at
  36% = a different edition ⇒ re-source, never flag-flip).
- **Gate won't start at all** — no `DATABASE_URL`/`DATABASE_URL_UNPOOLED`
  visible (env or `web/.env.local`). The gate is read-only but not DB-less.
