# Thayer's — source verification record (the publish-flip gate's required evidence)

This is the file `scripts/publish-flip.mjs`'s Thayer's gate requires before any flip of
`thayers-lexicon` (owner ruling 2026-08-21: checksum/shingle-diff of the TARGET database's
copy against the CC0 source edition, containing the sha256 value(s) compared).

**Current verdict (2026-09-08, full CC0-source diff below): BOTH database copies — dev and
prod — are byte-identical to the pinned CC0 source edition in every one of their 5,507
entry bodies. The "dead-OCR copy" narrative does not describe anything currently in either
database. Both copies are publishable on fidelity grounds; no re-ingest is needed.**

---

## 2026-09-08 — checksum + shingle-diff against the CC0 source (the diff the 2026-08-22
## pass explicitly deferred)

### The CC0 reference edition

Declared in `ingest/sources.config.json` (`thayers-lexicon.provenance`), fetched and
re-hashed this session:

- repo: `EveryPromiseBible/Every-Promise-Thayers`, pinned commit
  `a31ff38c40a681ef1029dcc51eb7e7ee3f2ea409`
- artifact: `https://github.com/EveryPromiseBible/Every-Promise-Thayers/archive/a31ff38c40a681ef1029dcc51eb7e7ee3f2ea409.tar.gz`
- **sha256(tar.gz) = `51f1d10cbea808020ea1edd65b20e67bb22380d93158e0317013856de6f6a5a3`**
  — matches the value recorded at first archive (2026-08-13,
  `docs/evidence/profiles/thayers-2026-08-13T081600Z.log`), so the bytes fetched tonight
  are the bytes the certified ingest parsed.
- licence re-verified in the pinned bytes: `LICENSE` = CC0 1.0 Universal legalcode;
  `NOTICE` = public-domain dedication of the digitization; underlying lexicon PD
  (1889 corrected edition, Thayer d. 1901).
- parsed with the repo's own adapter (`src/ingest/adapter-thayers.ts`) → 5,521 entries,
  5,521 Strong's-keyed, 14 cross-reference stubs, 45 markup-repaired headwords, 100.0%
  Greek headwords — reproducing the 2026-08-13 acceptance numbers exactly.

### Method

1. Dev dump: `psql` (dev, `NEON_BRANCH=dev`) — `SELECT ordinal, heading, body FROM sections
   JOIN sources … WHERE slug='thayers-lexicon' ORDER BY ordinal`. Read-only.
2. Prod dump: same query inside `BEGIN TRANSACTION READ ONLY … ROLLBACK`. No rows modified
   anywhere in this pass.
3. Section checksum: sha256 over every section ordered by ordinal, fields
   `ordinal,heading,body` separated 0x1f, rows terminated 0x1e (the 2026-08-22 framing,
   reproduced).
4. Shingle-diff per entry, keyed by Strong's number (heading `G<n> <headword>` ≡ source
   key), with the repo's frozen shingle primitives (`src/ingest/resource-textmatch.ts`:
   `tokenListOcr` + `shingleHashSetOcr` n=3 + `containment()`), both directions. Because
   the frozen tokeniser folds to `[a-z0-9]` (it drops Greek — built for English OCR), a
   Greek-preserving sibling tokeniser (same layout stripping, keeps polytonic Greek) was
   run alongside, also n=3, same FNV-1a hasher.
5. Entry bodies compared byte-for-byte against the source JSONL as ground truth.

### Numbers — DEV

```
sections = 5507 (ordinals 1..5507, no gaps; section_embeddings 5507, 1:1)
sha256(ordinal,heading,body · 0x1f/0x1e) = e10b468bea377408477b61140a0f2195c942ec8b64d0e8e3a35270faf5419814
Greek-script headings: 5507/5507 · Strong's-keyed headings: 5507/5507 · duplicate keys: 0
source entries with no dev section: 14 — G2036 G2249 G2252 G2260 G2273 G2534 G3098 G3391
  G4239 G4477 G4483 G4495 G5210 G5315 — exactly the adapter's 14 sub-20-char
  cross-reference stubs, excluded by the bridge's own fragment floor (counted 2026-08-13)
dev sections with no source entry: 0
heading ≠ source key: 0
entries compared: 5507 · byte-identical bodies: 5507/5507
corpus-level shingle containment (frozen latin n=3):  db-in-src 100.00% · src-in-db 100.00%
corpus-level shingle containment (greek-aware n=3):   db-in-src 100.00% · src-in-db 100.00%
mean per-entry containment (latin n=3):               db-in-src  99.65% · src-in-db  99.65%
mean per-entry containment (greek-aware n=3):         db-in-src 100.00% · src-in-db 100.00%
```

### Numbers — PROD (read-only transaction)

```
sections = 5507 (ordinals 1..5507, no gaps; section_embeddings 5507, 1:1)
sha256(ordinal,heading,body · 0x1f/0x1e) = e10b468bea377408477b61140a0f2195c942ec8b64d0e8e3a35270faf5419814
Greek-script headings: 5507/5507 · Strong's-keyed headings: 5507/5507 · duplicate keys: 0
source entries with no prod section: the same 14 stubs as dev
prod sections with no source entry: 0
heading ≠ source key: 0
entries compared: 5507 · byte-identical bodies: 5507/5507
corpus-level shingle containment (frozen latin n=3):  db-in-src 100.00% · src-in-db 100.00%
corpus-level shingle containment (greek-aware n=3):   db-in-src 100.00% · src-in-db 100.00%
mean per-entry containment (latin n=3):               db-in-src  99.65% · src-in-db  99.65%
mean per-entry containment (greek-aware n=3):         db-in-src 100.00% · src-in-db 100.00%
sources row: status=published, license='Public Domain' (dev: staged)
```

The prod section sha256 equals dev's, and both equal the value this same framing produced
on 2026-08-22 — three independent sessions, one byte string.

### Anomaly list (per-entry, anything < 80% containment in any direction)

19 entries flagged, all by the latin tokeniser only, all false alarms of the measurement:
G251 ἅλς, G756 ἄρχομαι, G961 Βεροιαῖος, G1432 δωρεάν, G1489 [εἴγε, G1512 εἴ περ,
G1746 ἐνδύω, G1966 ἐπιοῦσα, G2389 Ἰαννῆς, G2419 Ἱερουσαλήμ, G2544 καίτοιγε,
G3002 Λεββαῖος, G3378 μή, G3415 μνάομαι, G3746 ὅσπερ, G3757 οὗ, G4201 Πόρκιος,
G4240 πραΰτης, G5410 Φόρον.

Every one is a short all-Greek cross-reference body (20–50 chars, db length == source
length exactly). The frozen latin tokeniser leaves zero tokens, and `containment()` is
defined as 0 on an empty set — hence 0.0%/0.0%. Under the greek-aware tokeniser all 19
score 100%/100%, and all 19 bodies are byte-identical to the source. Nothing here is a
content anomaly. No entry in either DB scored below threshold on the greek-aware pass.

### Human eyes on the data (never let a number stand in for looking)

Three entries read on the source and both databases, byte-identical, genuine Thayer
lexicography: `G25 ἀγαπάω` (full morphology, 1Jn 4:10 WH-text note), `G2507 καθαιρέω`
(Luk 12:18 citation), `G5115 τόξον` (Septuagint קֶשֶׁת gloss, Rev 6:2).

### What is actually wrong with the prod copy

**Nothing, at the section level.** Prod's 5,507 entry bodies are byte-identical to the
CC0 source edition. The "dead-OCR copy" was the pre-2026-08-13 archive.org ingest
(`greekenglishlexi00grimuoft`; 50.2% fuzzy / 6.2% strict headword recognizability, 0%
Greek script), quarantined 2026-07-17 and replaced by the structured re-source on
2026-08-13. It survives nowhere in either database's `sections`.

Known non-section issues, unchanged from 2026-08-22 and NOT re-measured tonight (out of
scope for this diff): the 7,570 stale flat-embedding rows on prod (`served=true`, 2,865
keying to no live section, reachable by no shipped query — cleanup already filed), and the
edition's own content properties carried verbatim from the CC0 source (96 Strong's-style
filler entries where the digitization has gaps; fused-word artifacts like `Latinin-`).
Those are properties of the CC0 edition itself, not database corruption.

### Verdict

Both the dev and prod copies of `thayers-lexicon` match the pinned CC0 source edition
(tarball sha256 `51f1d10cbea808020ea1edd65b20e67bb22380d93158e0317013856de6f6a5a3`, section
sha256 `e10b468bea377408477b61140a0f2195c942ec8b64d0e8e3a35270faf5419814` on both targets)
as closely as a copy can: 5,507/5,507 byte-identical bodies, 100% corpus shingle
containment both directions, zero unexplained anomalies. **Either copy is publishable on
fidelity grounds. No re-ingest is recommended.** Serving remains a separate owner call
(lexicons are reachable by no lane — the standing D4 note in the manifest).

---

## 2026-08-22 — prior record (prod-state check; superseded only in coverage)

Written after the prod-state check the quality pass ordered — that check overturned the
standing narrative in BOTH directions:

1. **Prod does NOT hold the dead OCR copy.** The quarantine record's signature ("0%
   Greek-script headwords") matches nothing on prod: 5,507/5,507 sections carry
   Greek-script headwords, 5,507/5,507 are Strong's-keyed — identical to dev's
   certified-healthy 08-13 re-ingest.
2. **Prod's `thayers-lexicon` was ALREADY `published` and serving** (7,570 flat embeddings
   `served=true`) before that night's five-work flip, proven by the flip's own pre-snapshot
   (`flip-pre-snapshot-2026-08-21T17-42-00-008Z.json`).

Measured then, byte identity prod ≡ dev:

```
sha256 over every section, ordered by ordinal, fields separated 0x1f, rows 0x1e:
DEV : sections=5507 sha256=e10b468bea377408477b61140a0f2195c942ec8b64d0e8e3a35270faf5419814
PROD: sections=5507 sha256=e10b468bea377408477b61140a0f2195c942ec8b64d0e8e3a35270faf5419814
md5 corroboration (SQL, md5-chain ordered by ordinal): f1cb11fc25cb8cd672f519caaebdeee9 — both sides
```

That pass's stated gap — "full shingle-containment against the source edition was NOT
run" — is closed by the 2026-09-08 diff above.
