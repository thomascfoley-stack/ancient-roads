# RESULT — ADR-118 ef lever (2026-08-24)

Pre-registration: PRE-REG.md (committed 6663433, before any run). All four bars measured:

| bar | requirement | measured | verdict |
|---|---|---|---|
| 1 | pn20 HIT@2 ≥ 18/20 (frozen) | ef=64 baseline **17/20** (3rd reproduction) · ef=200 **18/20** · shipped-constant rerun **18/20** | **CLEARS** |
| 2 | full v4 holds at chosen ef | every category pass: verse-ref 40/40 · pericope 15/15 · epistle 25/25 · topical 19/20 · proper-noun 10/10 (several improved vs July) | **CLEARS** |
| 3 | controls clean | 10/10 clean, hijacks=0 | **CLEARS** |
| 4 | pool latency ≤ 2× ef=64 p50 | wall-clock parity: 1503ms (ef=64) vs 1493ms (ef=200), incl. connection | **CLEARS** |

**Change:** `HNSW_EF_SEARCH` 64 → 200 (`web/src/lib/teacher/routing.ts` + `src/teacher/routing.ts`
mirror), comment now carries the number's history and the re-sweep instruction. One constant;
`legalBasePool` is the single entry (the comment's "one way in" design is why one line suffices).

**Note for the record:** the first ef=200 attempt used `--ef=200`; the harness's argVal is
space-separated, so that run silently repeated ef=64 (TAG line caught it). The flag form is
`--ef 200`; the shipped-constant rerun (no flag) is the proof the CODE change carries.

**Sweep table:** ef=64 → 17/20 · ef=200 → 18/20. ef=400 not run (rule was smallest clearing value).
Logs: pn20-ef64-baseline.log · pn20-ef200.log · v4-ef200.log · pn20-shipped-ef200.log.
