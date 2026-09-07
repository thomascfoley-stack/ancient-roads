# My Works — false-confidence audit of the test suite (2026-09-07)

Owner: "do #4 as well" (2026-09-07). The pass owed since 2026-08-31, when
`upload-direct-guards.test.ts:161` was found reporting 6/6 green while testing nothing behind an
`as never` cast. Three read-only agents over 35 `web/test/user-corpus/` files plus every My Works
test outside that directory (~55 files), partitioned so no two overlapped: upload/quota/storage ·
parse/pipeline/content · queue/search/joins/UI. None of them wrote code; each was asked, for every
`it()`, whether it can pass while the property its NAME claims is false, and to state the one-line
PRODUCT change that should turn it red but would not.

**The headline: the suite is large, mostly honest, and its three weakest points are all on the
trust boundary.** 5 CRITICAL, 13 HIGH, 14 MEDIUM, 8 LOW. No product defect was found — every
finding is a check that would not notice one. Two failure shapes account for most of it:

1. **A bare `return` inside `it()` is a PASS, not a skip.** Four tests gate on a credential and
   then `return`, so vitest reports a green tick on a property that never executed. One of them is
   the ONLY test that proves a user's own row cannot surface through the tradition-gap join.
2. **A mock that supplies the answer the test then asserts.** Where `runAsUser` is a bare `vi.fn()`,
   the SQL never runs, so the predicate under test — the dedupe race clause, the claim CAS — is
   never executed by the test written to protect it.

## CRITICAL — fixed in this pass

| # | The test | What it cannot see | Seed that should redden it |
|---|---|---|---|
| C1 | `tradition-gap.test.ts:196,250,289` — the A2/D9/D8 trust-boundary legs | `if (!ownerUrl) { console.warn(…); return; }` inside `it()` reports **PASS**. A2 is the only test that seeds a user-owned row into `embeddings` and proves it does not surface; its own header records that deleting the fence once left the suite green. | delete `AND e.user_id IS NULL` from `tradition-gap.ts:160` |
| C2 | `tradition-gap.test.ts:152` — "never returns the user's own words — the trust boundary (§7)" | All three assertions are unfalsifiable: `origin` is a hardcoded literal in the row mapper (`tradition-gap.ts:194`), the author string is never a value in `embeddings`, and the user's title lives in a table the statement never reads. | same seed as C1 |
| C3 | `sec1-upload-gate.test.ts:86` — the SEC-1 upload ceiling | `expect(multiUserUploadsEnabled(on)).toBe(MULTI_USER_UPLOADS)` is `expect(true).toBe(true)` now the constant is `true`. The committed ceiling is the one thing CI can see about production's upload gate. | drop `MULTI_USER_UPLOADS &&` from `access.ts:54` |
| C4 | `upload-direct-guards.test.ts:195` — "a cross-tenant pathname returns 403" | The only hostile string sent is `user-corpus/other-user/doc-1`, which fails even a bare prefix check. The traversal the route's own comment names — `user-corpus/{me}/../{other}/{doc}` — is never sent. | replace `PATHNAME_RE.test(pathname)` at `upload-complete/route.ts:46` with `pathname.startsWith(...)` |
| C5 | `upload-quota.test.ts:141` — NULL `byte_size` "never poisons the sum" | Seeds one NULL row on a near-empty account and asserts `{ok:true}` — exactly what a broken sum also returns. Constant against itself. | see the correction below |

**Correction to C5's seed, measured rather than assumed.** The audit proposed "drop the `COALESCE`
from `quota.ts:92`" as the reddening change. It is not one, and neither the old test nor the new one
goes red on it — *no* test can, because the premise is wrong twice: SQL `sum()` **skips** nulls
rather than being poisoned by one, so a mixed set still totals correctly; and where `sum()` genuinely
is null (zero rows, or every row null) the driver returns `null` and `Number(null)` is already `0`,
the same value the COALESCE supplies. The COALESCE is belt with no observable behaviour, and
`quota.ts`'s own comment overstates it. The rewritten test proves the thing that IS observable — the
byte total is consulted and refuses with a null row present — and red-proves on replacing the sum
with a constant. Recorded because an audit finding taken on trust would have produced a test with a
false SEED comment, which is the defect this pass exists to remove.

### How each critical was closed, and its red-proof

- **C1** — the three legs are `it.skipIf(!OWNER_URL)` with an `announceSkip`, so vitest reports
  **3 skipped** and states the missing credential, where it reported 15 passed before. Verified both
  ways on this machine: without the owner URL `13 passed | 3 skipped` plus a NOT RUN line; with it,
  `16 passed` — A2, D9 and D8 genuinely executing.
- **C2** — the three unfalsifiable assertions are gone. What remains is what the leg can honestly
  check (rows come back, shaped as corpus voices, with a non-vacuity guard), and the fence gets a
  new structural sibling that runs with **no database at all**:
  `the corpus fence is in the shipped statement`. Red-proved by deleting `e.user_id IS NULL` from
  `tradition-gap.ts` → red; restored → green. The behavioural proof is still A2; this is the half
  CI can run.
- **C3** — the SEC-1 ceiling. The advisory leg's `expect` was inside a branch that never executes
  (the ignore list is empty), so it is now an unconditional implication. The composition leg could
  not be fixed at runtime — while `MULTI_USER_UPLOADS` is `true`, `true && B` and `B` are the same
  function for every input, which is why the first attempt at a fix went green against its own seed.
  It is a **structural** check now, and says so: the function body must reference the constant, and
  the constant must stay a boolean literal. Red-proved twice — dropping `MULTI_USER_UPLOADS &&` from
  `access.ts` → red; turning the constant into an env read → red.
- **C4** — the traversal is sent now, along with four other shapes a prefix check would admit.
  Red-proved by replacing the route's anchored regex with `pathname.startsWith(...)` → red on
  `user-corpus/<me>/../<other>/<doc>`.
- **C5** — see the correction above. Red-proved by replacing the byte sum with a constant → red,
  and the control assertion ("the fixture is not over the cap") fires first with its own message.

## HIGH — filed with seeds, not all fixed

**Upload/storage.** H1 bucket keys are never executed (`@/lib/rate-limit` wholly mocked), so
`corpus-complete:min` → `corpus-upload:min` halves the upload budget green. H2 "BEFORE a presign is
issued" asserts only a status code; the presign helpers are plain arrows, never spies. H3
`toMatch(/CLAIMED_STATUSES/)` is satisfied by a COMMENT at `documents.ts:231`. H4/H5 mock
`runAsUser`, so the claim CAS and the D8 dedupe clause never run — both can be deleted green. H6 six
`toMatch` over source assert presence, not reachability. H7 greps the wrong file for the retry's
`resetAttempts` default. H8's `ROUTES` list omits `upload-url` and `upload-complete`, the two routes
of the path the product actually uses.

**Parse/pipeline.** H1 the per-page floor is never fed a page in `1..99` — the stamp-only scan page
it exists for — so narrowing it to `< 1` is green. H2 `MIN_CHARS_PER_PAGE`, documented as MEASURED
(n=120/n=12), is pinned by nothing: any value in `[11, 1350]` keeps the partition green. H3
`model-parity` covers one of the two call sites it names. H4 the translation-confidence FORMULA is
asserted against no computed value — `confidence = 0.9` is green, and that number is written into
every anchor row. H5 `FALLBACK_CONFIDENCE` is self-referential in both its references.

**Queue/search/UI.** H1 the SEC-1 advisory gate's `expect` sits in a branch that never executes
(the ignore list is empty), so the `it()` runs zero assertions. H2 the D1 wedge can be reintroduced
green — `READINGS_AFTER_INGEST` is a constant no product code reads. H3 `search-limit-default`
mocks the layer the default lives in, so `DEFAULT_LIMIT` → 1 restores B019's symptom green. H4 the
"zero spend is structural" scan matches one import spelling in one directory, and misses the alias
form the repo actually uses. H5 the draft-check → tradition-gap wiring has never been observed
green: it dies at vitest's 5 s default while the real join runs (passes alone in 2.7 s).

## MEDIUM / LOW — the full list

Recorded in the three agent reports (session transcript). The recurring ones worth naming here:

- **Source-grep tests satisfiable by a comment** — five instances beyond H3. `documents.ts:231`
  demonstrates it concretely. The remedy is the one applied to `session-mock-surface.test.ts` the
  same night: strip comments before matching.
- **`console.warn` + `return` instead of `announceSkip`** — `ownership-assertion.test.ts:31` (a
  LICENSING property, green-when-absent), `upload-quota.test.ts:63`, `quota-toctou.test.ts:22`,
  `anchor.test.ts:15`, `translation-detect.test.ts:29`. The first reports PASS; the rest land in
  `ci-skip-ceiling.mjs`'s residual bucket miscounted as missing secrets.
- **`teach.ts`'s corpus-only `RetrievalContext` is hand-copied into the test that guards it**
  (`ask-additive-not-load-bearing.test.ts:62`), so appending user voices to `sectionIds` — the
  verdict condition — stays green.
- **Constants asserted against themselves**: `MAX_OFFSET`, `MIN_DOC_CHARS` (one side only),
  `METADATA_HEAD_CHARS`, `KJV_FAMILY` (two of five members), `SHIPPED_K`'s "consistency" check
  (`8 - 6 + 1 === 3` with both numbers local literals).

## Not covered by any lens

`checkCorpusCompleteRateLimit` — no test anywhere: no threshold, no fail-closed, no bucket name.
`upload-complete`'s entire success path (the suite that drives it has no database, so every call
past the limiter 500s). Route-level cross-tenant reads on GET/POST/DELETE of `documents/[id]`.
`uploadDenial` / the SEC-1 owner allowlist (mocked away in its own partition). Real blob storage
(the one real test skips for a missing token). `work-beside-tradition.tsx` has no test at all. The
tradition-gap RANKING (`ORDER BY h.ranges_hit DESC`) and the slug→title resolution are unasserted.
`/ask` cross-tenant isolation has a proof but no CI job runs it with a database.
`upload-direct-guards.test.ts:161`'s `as never` — the 2026-08-31 instance — was NOT re-examined by
this pass; it sits in the same file as C4 and remains open.
