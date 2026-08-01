# Concordance census — reconciling 13,480 against 295

Tranche 3 of [the post-A1 corrections order](../../pm/orders/2026-08-01-post-a1-corrections.md).
**A measurement, not a repair.** Nothing here was fixed. Read-only throughout: no deploy, no
production database, no writes to any tree. Measured 2026-08-01.

---

## Verdict, first

**The restore is COMPLETE, and it is byte-exact.** `web/public/concordance/` on the deploying
machine is identical, file for file and byte for byte, to the concordance asset in **both**
`corpus-backup-2026-07-28` and `corpus-backup-2026-07-19`. Nothing is missing. **This is not a
Deploy A blocker.**

**The two numbers were never in conflict — they count different things, and both are correct.**
`deploy.sh:81` calls 13,480 a *file* count. It is the count of **Strong's entries**. The concordance
is bucket-sharded: **295 files holding exactly 13,480 entries.** The number reproduces to the digit.

Two real defects surfaced while measuring, neither of them the one the order anticipated. Both are
recorded below and **neither was fixed**:

1. **A live filename collision** that silently blanks the concordance panel for Hebrew `H1` (אָב,
   "father", 1,060 verses). It is in the backups too, so it is a build defect, not a restore defect.
2. **`web/public/devotional/` has no backup at all**, in any release. It is served, it is one file,
   and it cannot be restored from anything in this repository.

---

## 1. `web/public/concordance/` on the deploying machine, now

Tree measured: `~/Projects/ancient-roads-git` (the only clone carrying the corpus; the other two
have empty `web/public`). Read-only. Zero files under `concordance/` have changed since 2026-07-30,
so this is not a moving target.

```
files                295          (0 subdirectories; entirely flat)
bytes                3,673,944
roll-up SHA-256      8081b7793790f4975ac888f5d75f469daa1cd7123f8f88357973b7eff36ef39b
                     (sha256 over "relpath  sha256(content)" for every file, sorted by path)
file size            min 136   median 10,727   max 62,603
```

## 2. The same asset in the two releases

Downloaded to a scratch directory outside the repo; payload not committed.

| | files | bytes | roll-up SHA-256 | tarball SHA-256 |
|---|---|---|---|---|
| deploying machine | 295 | 3,673,944 | `8081b779…f39b` | — |
| `corpus-backup-2026-07-28` | 295 | 3,673,944 | `8081b779…f39b` | `7fb34f30bc25b3843ff7467cc43d4da7bd2461a3cf6393119d97afb3223a47b3` |
| `corpus-backup-2026-07-19` | 295 | 3,673,944 | `8081b779…f39b` | `4b3700304cef587c47169d245cabafde56f637ff9c9f69eaaf5c31b57a855d6a` |

**All three roll-up hashes are identical.** The two tarball hashes differ only because gzip records
its own metadata; the extracted trees are byte-identical.

`RECOVERY.md:125` records the 2026-07-28 restore as "concordance 295 files / 4.1M (SHA-256
`7fb34f30…a47b3`)". That tarball hash reproduces exactly. The "4.1M" is `du` (allocated blocks);
the payload is 3,673,944 bytes = 3.50 MiB.

## 3. Did the structure change between them? **No — and that is the answer to the whole question.**

The re-shard hypothesis the order raises ("295 large files versus 13,480 small ones") is **not what
happened**, because the two releases are identical to each other. Nothing was re-sharded between
2026-07-19 and 2026-07-28. The reconciliation is simpler and it is arithmetic.

`web/src/lib/original.ts:73-82` documents the layout, and the data matches it exactly:

```
Sharded by 2-digit prefix bucket (G3588 -> "G35"); outlier function words have
their own shard, flagged in the bucket.
```

Counted by content shape, not by filename:

```
295 files on disk
    144  bucket files    a map of { Strong's -> entry }, keyed <lang><floor(n/100)>
    151  shard files     a single { strong, count, verseIds } for one outlier word
      0  unclassified

13,480 Strong's entries across the 144 buckets
    13,328  carry verseIds INLINE
       152  carry { count, shard: true } and defer to a shard file

  buckets whose members disagree with bucketOf(): 0
```

**13,480 entries. `deploy.sh:81` says 13,480. The number in that comment is real and current — it is
simply an entry count wearing the word "files".** The most likely history is that the concordance
was one file per Strong's number when the comment was written on 2026-07-12, and the bucketing that
produced today's 295 files came later; either way, the comment's number describes this same corpus
and nothing is missing.

### `deploy.sh:81-83` is wrong in a second way that nobody has caught

```
# --archive=tgz: the static data dirs (concordance = 13,480 files, original,
# commentaries, lexicon) exceed Vercel's 15,000-file upload limit; archiving
# bundles them into one tarball. Added 2026-07-12 when the concordance shipped.
```

The four directories it names total **2,699 files** — comfortably under 15,000. The directory that
actually blows the limit is **`bible`, at 22,590 files, and the comment does not mention it.** All
six served directories together are 25,290 files.

**`--archive=tgz` is still required.** The conclusion is correct; the reasoning is not. Left as
found, per the order.

## 4. What the currently-live deployment actually serves. **NOT RUN.**

Two independent gates, and I did not attempt to defeat either:

```
https://ancientpaths.app/concordance/H0.json
  -> HTTP 307, location: /gate?next=%2Fconcordance%2FH0.json
     web/src/middleware.ts:57 matcher is ['/((?!gate|api/gate|_next/|favicon.svg|...).*)'],
     so every corpus asset sits behind the SITE_PASSWORD gate.

https://web-hks342hef-home-network-hardening.vercel.app/concordance/H0.json
  -> HTTP 302, location: https://vercel.com/sso-api?...
     Vercel deployment protection on the *.vercel.app alias.
```

**What would settle it,** cheapest first:

1. The owner opens `https://ancientpaths.app/gate`, authenticates in their own browser, then loads
   `/concordance/H0.json` and `/concordance/H1.json` and reports the byte counts. Two page loads.
2. Temporarily disabling Vercel deployment protection on the `web` project would make the
   `*.vercel.app` alias readable without touching `SITE_PASSWORD`. An owner call, and a public
   exposure decision.
3. `vercel inspect` against the deployment with an account that can see the project, if it will
   enumerate the static output manifest.

**What can be said without it, and its limit.** The live deployment is `24677ba`, deployed
2026-07-19 16:57:06Z, and `deploy.sh` uploads the working tree. The 2026-07-19 backup is
byte-identical to what is on disk today. So the concordance that shipped on the 19th was *very
likely* these same 295 files. **That is an inference from two adjacent facts, not a measurement of
the deployment**, and I am not recording it as one.

## 5. The other five served directories

`servedAssetDirs()` derives six: `bible`, `commentaries`, `concordance`, `devotional`, `lexicon`,
`original`. Each compared against `corpus-backup-2026-07-28`.

| directory | files on disk | bytes on disk | in backup | verdict |
|---|---|---|---|---|
| `bible` | 22,590 | 158,286,312 | 22,590 / 158,286,312 | match |
| `commentaries` | 1,213 | 424,536,756 | 1,213 / 424,536,756 | match |
| `concordance` | 295 | 3,673,944 | 295 / 3,673,944 | match (roll-up hash too) |
| `devotional` | 1 | 1,489,403 | **no asset exists** | **NOT BACKED UP** |
| `lexicon` | 2 | 3,102,678 | 2 / 3,102,678 | match |
| `original` | 1,189 | 44,280,085 | 1,189 / 44,280,085 | match |

### `devotional/` has no RELEASE asset — and does not need one

> **CORRECTION (2026-08-01, same day, by independent verification).** This section originally
> concluded that `devotional/` was "not partially restored, but unbackupable from this repo" and
> that "the download that restores everything else does not restore it." **That inference was
> wrong.** `web/public/devotional/morning-evening.json` is **tracked in git** — it is the only
> served directory absent from `.gitignore:18-38` — so any clone restores it. The measurement below
> (zero devotional assets in every release) is correct; the conclusion drawn from it was not. The
> five *gitignored* directories are the ones that depend on the release tarballs.
>
> The mistake is worth naming: I checked the releases, found nothing, and did not check the one
> other place a file can live. A negative result from one source, reported as a property of the
> world — the same shape as the watchlist's sixth entry.

`morning-evening.json`, 1,489,403 bytes, served by the client and derived into the served set. Every
release in the repository was checked:

```
corpus-backup-2026-07-28          : devotional assets = 0
corpus-backup-2026-07-19          : devotional assets = 0
biblehub-quarantine-backup-2026-07-19 : devotional assets = 0
```

`RECOVERY.md` §3a lists five backed-up assets and does not mention `devotional`, so the omission is
consistent — but §3's restore command names five directories and the served set is six. If this file
is lost, the download that restores everything else does not restore it. It is one file and small;
the fix is to add it to the next release. **Not done here** — the corpus carries
forbidden-provenance material and where a backup may be published is an owner ruling.

---

## 6. The defect this measurement turned up: a shard/bucket filename collision

**Found while counting, not looked for. It is live today, and it is in the backups, so it is a build
defect in the concordance generator rather than anything the restore did.**

A shard file is named `<Strong's>.json`. A bucket file is named `<lang><floor(n/100)>.json`. For any
Strong's number below 100 these are the same string. Exactly one entry in the corpus hits it:

```
bucket H0 declares      "H1": { "count": 1060, "shard": true }
so the client fetches   /concordance/H1.json
but that file on disk   is the BUCKET for H100-H199 (100 entries: H121, H187, H110, ...)
```

`fetchConcordance('H1')` (`web/src/lib/original.ts:96-112`) therefore returns the bucket object cast
to `Concordance`. Measured on the actual file:

```
.strong   = undefined
.verseIds = undefined
```

**The failure is silent, not a crash.** `web/src/components/word-panel.tsx:124` guards the section
with `concordance && concordance.count > 1`. On the bucket object `count` is `undefined`, so
`undefined > 1` is `false`, the whole block is skipped, and `:130`'s `concordance.verseIds.slice()`
never runs. The panel renders the lexicon entry and simply omits "Also appears in 1,060 verses". No
error, no console warning, no gate.

`H1` is אָב, *'ab*, "father" — 1,060 occurrences, one of the most common nouns in the Hebrew Bible.

**Scope: exactly one entry.** Of 152 shard-flagged entries, `H1` is the only one whose number is
below 100, and it is the only filename collision in the corpus. Verified: 0 required shard files are
missing once the collision is accounted for, and 0 shard files are orphaned.

**Not fixed**, per the order. Recorded for the owner. The remedy is a generator change (namespace the
shard filenames, e.g. `shard-H1.json`) plus a regeneration, which is corpus work and an owner call.

---

## 7. What it would cost to be wrong

**On the headline (restore complete).** Three independent measurements agree byte for byte, and the
entry count reproduces `deploy.sh`'s number exactly rather than approximately. If this were wrong,
Deploy A would ship a word-study page that renders nothing for the missing Strong's numbers, with
`predeploy-gate.ts` exiting 0 — because `missingServedAssetDirs()`
(`scripts/lib/served-assets.mjs:79-89`) is a `statSync(...).isDirectory()` **presence** check with no
file-count check anywhere in its 89 lines, and the gate's one counting block
(`scripts/predeploy-gate.ts:164-186`) runs `buildCorpusInventory(COMMENTARIES_DIR)` — commentaries
only. `fetchJson` returns `null` on a non-ok response, so the UI shows an empty panel rather than an
error. **That silent-failure analysis in the order is entirely correct; it just is not triggered,
because nothing is absent.**

**On the collision.** If I have the sharding rule backwards, the cost is one wasted owner decision
about one Hebrew word. I read the rule out of the shipped client rather than inferring it, and
confirmed the collision by loading the actual file and printing its keys.

**The gate gap remains real even though the corpus is intact.** Nothing in the repository would
detect a *partial* concordance. That is a standing weakness, not a live problem, and it is exactly
what would make a future loss silent. Recorded, not fixed.
