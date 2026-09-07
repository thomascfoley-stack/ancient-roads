# Top-up wave 2 digest — 2026-09-06 (order: docs/pm/orders/2026-09-06-finish-ingestion.md)

Loop run log: `topup-dev-wave2-2026-09-06.log` (same dir, untracked).
Loop digests: `digest-2026-09-06T22-44-43-797Z.md` (batch 1, 30 works — staged-backlog
breaker pause, by design) + `digest-2026-09-06T22-52-29-668Z.md` (batch 2, 9 works, queue-empty).
39/39 staged on dev, 0 quarantined. All 39 verified on dev: sections > 0 AND flat
embeddings > 0 (READ-ONLY txn, per-work table in the session report / WORKLOG).

## Mechanism

`acquire.min_units` (default 3, fail-closed unchanged without the profile) threaded into
`chooseUnitSelector`'s bestN and the final gate in adapter-ccel.ts; `acquire.matter_allow`
(regex) exempts a heading from MATTER_RE, with the div's own h-tag promoted to the
section heading when the override fires. Red-proofed: adapter reverted → 2 of the 6 new
tests in `test/ccel-min-units-profile.test.ts` fail; restored → 6/6 green.

## Ingested this wave (39)

38 via `min_units: 1` (list per /tmp/ap-triage-plan.json `general-fix-min-units-profile`)
+ charnock-nat-regen via `min_units: 1` + `matter_allow: "^title pages?$"` (its 331k-char
discourse is nested inside a div1 titled "Title Page"; served heading is the div's own
h1 "Discourse of the Nature of Regeneration").

Per-work notes the owner should see:

- **luther-prefacetoromans** also carries `matter_allow: "^preface"` — the preface lives in
  a div1 titled "Preface to the Letter of St. Paul to the Romans", which MATTER_RE's
  `^preface` branch otherwise drops, leaving only the 586-char Translator's Note.
- **clarke-entire-sanct** carries `heading_filter: "^Entire Sanctification"` — excludes the
  14.5k-char "About Adam Clarke" CCEL-staff biography unit that evades MATTER_RE.
- **law-errors / law-grounds** ingest a small title-stub unit (496 / 123 chars) alongside
  the real one — triage-flagged as harmless but visible.
- **Genuinely tiny, owner value call** (ingested per the triage plan's min-units route;
  drop is one staged delete each if the owner rules them out):
  pascal-memorial (3.6k chars), cranmer-doctrine (4.7k), donne-spital (5.9k).

## Owner-skip / escalation roster (20 — NOT ingested)

### Page-scan only on CCEL (15) — no text layer; archive.org OCR tier is the only route

- cyril-stluke — 386 page images, 445 chars text (Payne Smith translation).
- cyril-stlukev2 — same, vol 2.
- charles-otpseudepig — 700 page images, 5.1k chars.
- hastings-dict1 — 956 images; div2 letter-range TOC shells with `<img>` bodies.
- hastings-dict2 — 928 images, same shape.
- hastings-dictv1 — 880 images, same shape.
- hastings-dictv2 — 888 images, same shape.
- hastings-dictv3 — 912 images, same shape.
- hastings-dictv4 — 1008 images, same shape.
- calvin-institutio1 — LATIN Institutio, 466 "Missing page-scan" markers; English already in corpus as calvin-institutes.
- calvin-institutio2 — same, vol 2.
- scrivener-ntcrit1 — 435 `<pb>`→png markers, 5.6k chars TOC.
- scrivener-ntcrit2 — same, vol 2.
- hoskier-codexb2 — 402 `<pb>`→png markers, 3.5k chars.
- spurgeon-treasury — HIGH VALUE; vols 1–6 all page scans (440–506 imgs each). Needs alt
  source (spurgeon.org per-Psalm clean HTML, or archive.org 7-vol Funk & Wagnalls OCR) —
  OWNER DECISION pending.

### TOC-shell duplicates (3) — verified READ-ONLY on prod 2026-09-06 (ep-odd-fog)

- calvin-commentaries — 8.8KB TOC shell → calcom01–45; prod check: all 45 per-volume
  works present with sections (1,790 sections total across calcom01–45; calcom01 = 23
  sections / 1,023 flat embeddings). This slug would only duplicate them.
- henry-mhc — 10.7KB volume index → mhc1–6; prod check: all 6 present (1,189 sections;
  mhc1 = 187 sections / 4,368 flat embeddings).
- macdonald-unspoken — 3.7KB series landing → unspoken1–3; prod check: all 3 present
  (36 sections, flat embeddings 227/345/284).

### Wrong-or-missing CCEL id (1)

- vincent-word-studies — does not exist on CCEL under any id (ccel_author enumeration
  verified empty live 2026-09-06). Needs alt source (archive.org 1887 ed.) or drop.

### Index volume, not content (1)

- hodge-theology4 — manifest title is "Systematic Theology - Index": 235k chars of index
  entries. MIN_UNITS refusal was CORRECT.

## Routed to follow-up agents (manifest entries done this session; ingest NOT run here)

- newman-apologia — manifest acquire switched to `adapter: gutenberg, ebook_id: 22088`
  (CCEL is 560 page scans; #22088 is the clean 1864 text). NOTE: adapter-gutenberg
  requires a per-slug PROFILES entry before it can run (`no gutenberg profile for
  newman-apologia` until then) — that is the follow-up agent's lane.
- foxe-martyrs — historian-head (Forbush abridged edition, plain-HTML chapter files, not
  ThML); rides ingest-historian.ts with a purpose-built jsonl crawl. No manifest change
  needed (already `source_type: historian`).
