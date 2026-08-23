# BUG_SWEEP.md — temporary bug intake for the Detail sweep

**Temporary file. Delete when every row is CLOSED and merged.** Opened 2026-08-23 against
working tree `81cc73e` (`fix/q1-signed-out-state`). All bugs reported by Detail scanning
`15793b3`.

Working loop per bug: **reproduce (red) → plan → write the exit test → fix → re-run (green) →
re-run the neighbours it could break → paste the evidence inline here.**
A bug is not CLOSED until its test has been watched go RED against the unfixed code
(`docs/THE_LOOP.md` rule 4). Evidence goes in this file verbatim, not as a link.

Status vocabulary: `INTAKE` (pasted, not yet checked) · `REPRODUCED` (executed, red output
pasted) · `CONFIRMED BY READ` (defect visible in source; no runtime repro yet) · `PLANNED` ·
`FIXED-UNVERIFIED` · `CLOSED` · `NOT-A-BUG` (with the disproof) · `DEFERRED` (with the reason).

## Board

| # | Issue | Bug | Files | Sev | Status |
|---|---|---|---|---|---|
| B1 | #108 | `scanReferences` misses attached-digit ordinals (`1Cor 13`) | `src/bible/ref-parse.ts` + `web/` twin | P2 | **REPRODUCED** |
| B2 | #120 | Title truncation splits surrogate pairs → U+FFFD written to DB | `web/src/lib/research.ts`, `history-threads.ts` (+ wider class) | P3 | **REPRODUCED** |
| B3 | #119 | `/api/eval/bait` raw 500 on `teach()` throw — no envelope, no log | `web/src/app/api/eval/bait/route.ts` | P3 | **CONFIRMED BY READ** |
| B4 | #118 | Reader: stale chapter fetch overwrites the fresh one | `web/src/app/read/[book]/[chapter]/page.tsx` | P3 | **CONFIRMED BY READ** |
| B5 | #117 | Bible API ingest trusts response shape; crashes or skips chapters | `src/ingest/ingest-api.ts` | P3 | **CONFIRMED BY READ** |
| B6 | #113 | History thread create is two transactions — orphan empty chats | `web/src/lib/history-threads.ts` | P3 | **CONFIRMED BY READ** |
| B7 | #112 | `embedded` counted before persistence — inflated ingest logs | `src/retrieval/ingest.ts` | P3 | **CONFIRMED BY READ** |
| B8 | #111 | `decodeZld` missing `.dat` bounds check — silent truncation | `src/ingest/sword-ld.ts` | P3 | **CONFIRMED BY READ** |
| B9 | #110 | Sign-up leaks account existence; sign-in does not | `web/src/components/auth-forms.tsx` | P3 | **CONFIRMED BY READ** |
| B10 | #106 | `.docx` entity decode throws `RangeError` on out-of-range code point | `web/src/lib/user-corpus/parse-docx.ts` | P3 | **CONFIRMED BY READ** |
| B11 | #116 | Upload quota TOCTOU — concurrent uploads exceed the cap | `web/src/lib/user-corpus/quota.ts` + upload route | P2 | **CONFIRMED BY READ** |
| B12 | #115 | Gazetteer label `Easter` anchors every Easter mention to the controversy | `src/ingest/history-gazetteer.ts` | P2 | **CONFIRMED BY READ** |
| B13 | #114 | Annotation rollback overwrites newer highlights/notes after a failed retry | `web/src/lib/use-annotation-writes.ts` | P2 | **CONFIRMED BY READ** |
| B14 | #109 | Interlinear toggle exposes no pressed state to screen readers | `web/src/components/reader-header.tsx` | P2 | **CONFIRMED BY READ** |
| B15 | #107 | `runScreens` reports only the first hit per pattern — incomplete regen feedback | `src/verifier/screens.ts` + `web/` twin | P2 | **CONFIRMED BY READ** |

**Nothing here is a licensing, attribution, or interpretation breach** — the three existential
classes are untouched by this sweep. B12 is the only one that has already written wrong data.

### Suggested order (not yet ruled)

1. **Pure-logic, test-first, near-zero blast radius:** B8, B10, B7, B5, B14 — bounds/guard/attribute
   fixes with an obvious red-proof. Do these first to build the loop.
2. **Contract fixes with a mocked test:** B3, B6, B2, B15.
3. **Client behaviour, needs a rendered check as well as a unit test:** B4, B9.
4. **Needs a decision before code:** B11 (locking strategy), B12 (data already written — the
   cleanup is the owner's call), B13 (an existing green test encodes the bug), B1
   (retrieval-behaviour change under the DoD).

**Two bugs are byte-sync-guarded** — B1 (`src/bible/ref-parse.ts`) and B15
(`src/verifier/screens.ts`). Both copies change together or `test/bible-sync.test.ts` /
`test/web-core-sync.test.ts` go red.

### Standing note on the reports themselves

**Three of fifteen issue headers link the wrong file** — B5 (#117 → `versification-gate.ts`,
actually `ingest-api.ts`), B14 (#109 → `library/word-study/page.tsx`, actually
`components/reader-header.tsx`), B15 (#107 → `verifier/v1.ts`, actually `verifier/screens.ts`).
In all three the issue **body** names the right file. **Trust the body, verify the path, ignore
the header link.** Every bug above was checked against the actual source before being written up;
none was taken on the report's word.

---

## Honest grading of the batch (added 2026-08-23, after the owner asked "are these actually good findings")

**Confirming 15/15 is a warning sign, not a credential.** The reason the hit rate is that high is
structural, and it caps what this batch is worth: nearly every finding is an **intra-codebase
consistency check** — *this file guards the bounds, that one doesn't; this route wraps the throw,
that one doesn't; this toggle has `aria-pressed`, that one doesn't.* That class is very hard to get
wrong (the counter-example is sitting in the same repo, often the same file) and also very hard to
learn anything deep from. High precision, low ambition.

So the findings are real. That is a different claim from "worth the time", and they are not equal:

| Grade | Bugs | Why |
|---|---|---|
| **Genuinely good — fix these** | B12, B13, B10, B11, B4, B1, B6 | Real user-visible harm or real cost: wrong data already written (B12), silent data loss (B13), crash on hostile upload (B10), spend (B11), wrong text on screen (B4), broken routing (B1), a known in-repo precedent violated three days later (B6) |
| **Real but low value — batch them, don't ceremony them** | B2, B7, B8, B14, B15, B9, B3 | Each is true and each is cheap. Also: a mangled character in a title (B2), a misleading log counter (B7), a corrupt-module guard for modules we get from CrossWire (B8), one ARIA attribute (B14) |
| **Not a bug** | B5 | Nothing is broken. The API has not changed shape. This is a robustness gap written up as a defect — worth a cheap guard, not a board row at the same level as B4 |

**Severity inflation to correct on two rows.** B15 (#107) is filed P2 and titled like a verifier
hole; it is neither — one hit still rejects the answer, so no unfaithful text ships (full argument
in the B15 section). B9 (#110) is filed as an enumeration oracle, but any sign-up form that refuses
duplicates leaks existence *by behaviour*; the fix narrows the channel and does not close it.

**What the batch did NOT find is the more important half.** Fifteen findings, and not one touches:
licensing or provenance · attribution · interpretation in the product's own voice · retrieval
accuracy or whether the corpus is right · whether the eval bars are honestly met. Those are the
existential classes in `CLAUDE.md`, and a clean sweep through them is **not evidence they are
clean** — it is evidence this finder was not looking there. Reading a 15-row green-adjacent board
as "the codebase is in good shape" would be exactly the unearned green `docs/THE_LOOP.md` §6
names. It says the guard rails on *style-of-defect* held, and nothing about the guarantees.

**One structural problem with me doing the fixing.** Every commit that introduced these is
Claude-written (`88b22fe` Opus 4.8, `a557ed8` Opus 5, `d711e60` Fable 5, and so on — full list run
2026-08-23). Three are my own model. `AGENTS.md` §3 and `BUILD_MODEL.md` §1.4 say fixer ≠ verifier
and an agent may not audit its own output. Detail is the independent eye on the *finding* side,
which is the right use of it. But the *fixes* below will be agent-written repairs to agent-written
code, verified by the same agent — which is the failure mode those rules exist to stop. The
mitigation is not a promise to be careful: it is that **every fix in this file ships with a test
watched RED first**, and that B13's fix in particular cannot self-certify, because an existing
green test currently encodes the bug.

---

## B1 — attached-digit ordinals invisible to `scanReferences` (#108, P2)

Introduced `88b22fe` (2026-07-10). Tracker says "Resolved 2026-08-23" — **that is the tracker's
state, not the repo's.** Reproduced live below; the defect is present.

`SCAN_RE`'s optional ordinal group requires `\s+` after the ordinal, and its book group is
`[a-z]{2,}`, which cannot start on a digit. `1Cor` forms no candidate at all and never reaches
`parseRef`. `normalizeBookInput()` already normalises `1john` → `1 john`
(`src/bible/ref-parse.ts:106`) — the scanner just never hands it the span.

**Reproduction — 2026-08-23 against `81cc73e`, verbatim:**

```
"1Cor 13" -> []
"turn to 1Cor 13:4-7 for the reading" -> []
"2tim 3:16" -> []
"1 Cor 13" -> ["1 Corinthians 13"]        <- spaced form works, so this is the gap
"1John 4:8" -> []
"what does 1cor 13 say" -> []
parseRef("1Cor 13") -> 1 Corinthians 13   <- parseRef already handles it
```

**CONFIRMED**, both halves.

**Blast radius — every `scanReferences` caller:**

| Call site | `isExplicitCitation` gated? | Effect of the miss |
|---|---|---|
| `src/bible/pericopes.ts:158` (`resolveIntent`, the /ask routing path) | **NO** | `inject`/`floor` empty — named passage not routed |
| `web/src/lib/user-corpus/anchor.ts:96` | YES | sermon anchor not found |
| `web/src/lib/user-corpus/metadata-extract.ts:48` | — | primary-text metadata missed |
| `src/ingest/ingest-sermon.ts:170,223`, `ingest-historian.ts:251`, `adapter-gutenberg.ts:89` | mixed | ingestion anchors missed |

The ungated `/ask` path makes this a routing defect, and it is also what caps the fix: **any
widening must not widen false positives there.**

**Precision constraint.** The comment block above `ORDINAL_BOOK_SCAN_RE` records why the period
form is admitted *only* behind a required ordinal — `\.?` on `SCAN_RE`'s bare book word would
make "did his job. 3 of them" → `Job 3`. The digit-attached fix has the same shape and the same
constraint: require the `[1-3]` prefix, stay additive (a separate `matchAll` pass, never a
loosening of `SCAN_RE`), and let `parseRef` validate every candidate. Also see the queued
`SCAN_RE` false-floor class in `docs/pm/MASTER.md` — do not make it worse.

**Plan:**
1. Add the two reported tests to `test/ref-parse.test.ts` plus precision guards (`3rd 4`,
   `1st 3`, `21cor 13`, `1 in 3` must stay `[]`). Watch RED.
2. Add a third additive pass `DIGIT_ATTACHED_SCAN_RE = /\b([1-3])([a-z]{2,})\.?\s+(...)/gi`
   feeding `consider()` — same shape as `ORDINAL_BOOK_SCAN_RE`.
3. Verify the overlap resolver still picks the right winner now that a third pass can produce a
   candidate over the same characters.
4. Copy to `web/src/bible/ref-parse.ts` **byte-identical** (`test/bible-sync.test.ts` enforces it).
5. Re-run `ref-parse`, `reference-intent`, `routing-orchestration`, `topical-refs`,
   `bible-sync`, `web/test/user-corpus/anchor`.

**Flagged, not assumed:** this changes what `resolveIntent` routes, so it is a
retrieval-behaviour change under CLAUDE.md's DoD. It only *adds* correctly-parsed references
that were previously dropped, and touches no ranking or corpus. Whether it needs a recorded
accuracy-diagnostic run is a call to make before merge, not to skip silently.

**Evidence:** _(fill on fix)_

---

## B2 — surrogate-pair split in title truncation (#120, P3)

Introduced `8a0a1ce` (2026-08-16), duplicated into `history-threads.ts`.

- `web/src/lib/research.ts:67` — `question.slice(0, TITLE_MAX - 1)`, `TITLE_MAX = 80`
- `web/src/lib/history-threads.ts:21` — `query.slice(0, 77)`, then `INSERT INTO chats (... title ...)`

**Reproduction — 2026-08-23, verbatim** (78 ASCII chars + U+1F600 + "tail"):

```
len(code units): 84  > 80: true
last cp: d83d lone surrogate? true
roundtrip tail: "xxx<REPLACEMENT CHAR>..."
contains U+FFFD: true
```

`slice(0,79)` lands mid-pair; `Buffer.from(t,'utf8')` round-trips the orphan to U+FFFD.
**CONFIRMED, including the persistence claim** — the `history-threads.ts` site writes the
mangled string straight into `chats.title`, so the damage is stored, not transient.

**Scope note — the class is wider than the two reported files, and NOT every member is a bug.**
`grep -rn "\.slice(0, *[0-9]\+)" web/src` finds ~30 sites, in three groups:

1. **Persisted** (durable corruption — the real defect): `research.ts:67`,
   `history-threads.ts:21`, `api/plans/route.ts:61`, `api/annotations/route.ts:129,154`,
   `api/search/commentaries/route.ts:62,66`, `lib/ask-outcomes.ts:93,139`,
   `lib/user-corpus/readings-job.ts:64`.
2. **Display-only** (one replacement char, gone next render — cosmetic): `ask-client.tsx`,
   `commentary-panel.tsx`, `verse-display.tsx`, `work-reader.tsx`, `my-works.tsx`,
   `history-context-bar.tsx`, `library/passages/page.tsx`, `word/[strongs]`.
3. **Not truncation at all** (`slice(0, 3)` on an array, a result cap) — leave alone:
   `history-results.tsx:161`, `history-search-db.ts:240`, `routing.ts:433`,
   `work-beside-tradition.tsx:218`, `my-works.tsx:856`, `ask-client.tsx:729`.

**Plan:** one shared helper in `web/src/lib/text.ts` (as reported), applied to the two named
sites, then sweep group 1. Do **not** blanket-replace every `.slice(` — group 3 breaks.

**Open question to decide explicitly:** count by **grapheme cluster** (`Intl.Segmenter`) or by
code point? Spreading with `[...str]` fixes surrogate pairs only — a family emoji or flag still
splits at a ZWJ. The spread alone closes the reported bug and is the smaller change; the
Segmenter version is correct but is a new API surface on a hot path.

**Exit test:** a title built to break exactly on the boundary; assert no replacement char and no
unpaired surrogate survives a UTF-8 round-trip. Watch RED first.

---

## B3 — `/api/eval/bait` has no try/catch around `teach()` (#119, P3)

Introduced `a8ff651` (2026-07-11). **Confirmed by read** — the handler ends:

```ts
if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 });
const { result } = await teach(question);
return NextResponse.json(result);
```

No try/catch. `teach()` can throw (notably `embedQuery()`), so the throw escapes and Next returns
a raw 500 — not the `{ error: { code, message } }` envelope `web/src/lib/api-error.ts` and
`docs/API_ERRORS.md` promise for every `/api/*` route — and it never reaches `logEvent('error', ...)`.
`/api/ask` wraps the same call correctly; this route is the odd one out.

**The report's history note is right and load-bearing:** the body-parse *was* wrapped, by the
2026-08-17 audit (its comment block is still in the file). That audit fixed the parse and left the
`teach()` call bare — the same defect class, half-closed.

**Second-order impact, not in the report and worth more than the P3 suggests:** this is the
endpoint the `interpretation_bait` harness drives, and faithfulness is the product guarantee. A
raw 500 mid-run is an *unclassified* outcome — the harness sees a non-JSON failure, not a typed
error. Whether `bait-run.mts` counts that as a breach, a skip, or a crash decides whether a
100/100 could ever have been a 99/100 with one silent hole. **Check `bait-run.mts`'s error
handling as part of this fix** — the route fix alone does not answer it.

**Plan:** wrap matching `/api/ask` (`console.error` + `logEvent('error', { where:
'api/eval/bait', ... })` + `apiError('INTERNAL')`). The file's standing "deliberately NOT added
here: a rate limiter" comment stays — do not touch it.

**Exit test:** mock `teach` to throw; assert JSON with `error.code === 'INTERNAL'`, status 500.

---

## B4 — reader chapter fetch has no cleanup (#118, P3)

Introduced `3e1eee0` (2026-07-06); never fixed. **Confirmed by read** of
`web/src/app/read/[book]/[chapter]/page.tsx:150-169`:

```ts
setData(null); setError(null); setStudy(null);
fetchChapter(fetchSlug, chapterNum, translation.id)
  .then(setData)
  .catch(() => setError('Failed to load chapter'));
}, [book, fetchSlug, chapterNum, translation, hydrated]);
```

No cleanup return, no `cancelled` flag. A fast switch starts a second fetch while the first is in
flight; if the first resolves last, `setData` overwrites the newer chapter. The header renders
`translation` (fresh) while `data` is stale.

**The codebase-inconsistency claim checks out:** `web/src/components/desk-pane.tsx:201-218` does
exactly the right thing (`let cancelled = false` ... `if (!cancelled) setData(d)` ... cleanup).
Copying that keeps the fix at "moving existing code" on the UX_REMEDIATION escalation ladder.

**Severity read — P3 is right, but the trigger named is the rarer one.** The dep array also
carries `fetchSlug` and `chapterNum`, so the same race fires on **rapid chapter navigation**
(next-chapter pressed twice) — a far more common gesture than double-switching translation. Same
one-line fix; write the test against the common trigger.

**Exit test:** two `fetchChapter` calls, resolve the *second* first and the *first* last, assert
the rendered verse text belongs to the second.

---

## B5 — Bible API ingest trusts the response shape (#117, P3)

Introduced `3e1eee0` (2026-07-06).

**File-path correction:** the issue header links `src/ingest/versification-gate.ts`. **The code is
not there.** The defect is `src/ingest/ingest-api.ts:120-125` — which is what the issue body
itself says. `versification-gate.ts` exists but is a different concern. Fix the file the body
names; do not touch the gate.

**Confirmed by read** — `ingest-api.ts:121` asserts `as { chapter: { number: number; content:
ApiVerse[] } }` and line 125 iterates `data.chapter.content` with no runtime check. A 200 with a
different JSON shape throws `TypeError: Cannot read properties of undefined`; the surrounding
retry re-issues the same request, gets the same bad body, and moves on — **the chapter is simply
never written**, with only a generic `TypeError` in the log.

The `adapter-helloao.ts` HTML guard (`if (text.startsWith('<'))`) is the pattern this file is
missing, as reported.

**Note on impact ranking:** silent missing chapters in an offline ingest is worse than the crash
it is filed under. A crash stops you; a skipped chapter ships. The fix should make the failure
**loud** — throw with the URL — not merely typed.

**Plan:** validate before iterating, throwing a message naming the URL and the missing field, per
the recommended fix. Add a `content`-not-an-array case too, not just `chapter`-missing.

**Exit test:** feed `fetchJson` a stub returning `{ translation: {}, book: {} }`; assert the
thrown message names the URL. Red-proof: the unfixed code throws `TypeError` instead.

---

## B6 — history thread create is two transactions (#113, P3)

Introduced `36eac00` (2026-08-19). **Confirmed by read** — `createHistoryThread` makes two
separate `runAsUser` calls: chat INSERT, then the two message INSERTs. If the first commits and
the second fails, a `chats` row with persona `'history'` and no messages is left behind.

**The codebase-inconsistency claim is exactly right and the precedent is in the same repo,
verbatim.** `web/src/lib/research.ts:61-79` carries the comment *"One transaction, one statement
(I1-L2): thread + question row cannot orphan each other"* and does it with a `WITH c AS (INSERT
... RETURNING id) INSERT ... SELECT ... FROM c`. `history-threads.ts` reuses the same tables and
reintroduces the pattern that comment was written to kill — three days later.

**The orphan really is undeletable, and the report explains why correctly:** listing and delete
paths fence on `persona = 'ask'`, history rows are `persona = 'history'`, and `getHistoryThread`
returns `null` when messages are missing — so the row is invisible to the UI *and* indistinguishable
from a nonexistent thread. The share URL 404s.

**Plan:** collapse into one statement. Note the shape is harder than `research.ts`'s: two message
rows, not one. A CTE with `INSERT ... SELECT ... UNION ALL` over the chat CTE does it in one
statement; verify the `sources` jsonb cast survives the union (column types must line up).

**Exit test:** stub the message INSERT to throw; assert **zero** `chats` rows with that title
afterwards. Red-proof against the current two-transaction version, which leaves one.

**Also note:** B2's `slice(0, 77)` bug is on line 21 of this same file. Fix both in one branch.

---

## B7 — `embedded` counted before persistence (#112, P3)

Introduced `87fbd74` (2026-07-08). **Confirmed by read** — `src/retrieval/ingest.ts:26` does
`embedded += vectors.length` and line 46 does `const res = await deps.store.upsert(rows)`, with
the catch at line 56 incrementing `failedBatches` and continuing. So a failed batch still counts
as embedded. `register-writer.ts` counts after the insert, from the row count.

The report's note that `0d3a0d3` made this *more* likely by catching failures instead of crashing
is the important part: before that commit an upsert failure ended the run, so the inflated
counter was never read. Resilience turned a latent inconsistency into a live one.

**Plan:** move the increment below the successful `upsert`, as recommended. Decide one thing
explicitly while there: `register-writer.ts` counts **persisted rows** (`rowCount`, so
`ON CONFLICT DO NOTHING` duplicates do not count), whereas the proposed fix counts
`vectors.length` (all rows in a successful batch). Those still differ. Either match
`register-writer.ts` exactly (`res.inserted`) or write down why `embedded` and `upserted` should
diverge — do not leave two definitions of one word in the logs.

**Exit test:** Detail supplied a runnable one. Use it as the red-proof, then invert the assertion
(`embedded` → 0) as the green.

---

## B8 — `decodeZld` missing `.dat` bounds check (#111, P3)

Introduced `530c4f3` (2026-07-17). **Confirmed by read**, and the asymmetry is stark in one file:

- `src/ingest/sword-ld.ts:179-181` (`decodeZld`): reads `off`/`size`, calls
  `dat.subarray(off, off + size)` with **no check**.
- `src/ingest/sword-ld.ts:198-202` (`decodeRawLd`): same pattern, **with**
  `if (off + size > dat.length) throw new Error(... overruns .dat ...)`.
- `sword-ld.ts:171` even has the analogous check for the *block* case
  (`overruns block`), so the author clearly knew the shape.

`Buffer.subarray` clamps rather than throwing, so a corrupt `.idx` yields a short record that can
still pass the downstream checks and produce a wrong entry — silently, in a file whose stated
principle is FAIL CLOSED.

**One thing the report missed, found while checking:** `sword-ld.ts:159-161` slices
`zdt.subarray(off, off + comp)` and feeds it to `inflateSync` with no bounds check either. That
one probably fails loudly (zlib rejects a truncated stream) rather than silently, so it is a
lower-grade instance — but it is the same omission and the fix should cover it or say why not.

**Plan:** add the `decodeRawLd` check verbatim to `decodeZld`. Two lines. Consider the `zdt` site.

**Exit test:** hand-built `.idx`/`.dat` pair whose last entry overruns; assert the thrown message
contains `overruns .dat`. Red-proof: the unfixed code returns a truncated entry instead.

---

## B9 — sign-up leaks account existence (#110, P3)

Introduced `3df340a` (2026-08-05, the SEC-1 auth cutover). **Confirmed by read** of
`web/src/components/auth-forms.tsx`:

- line 144 (sign-in): `throw new Error('That email and password do not match an account.')`,
  under a comment naming the "account-existence oracle" risk explicitly.
- line 173 (forgot-password): `setSent(true)` unconditionally — same posture.
- line 159 (**sign-up**): `throw new Error(err.message ?? 'That account could not be created.')`
  — server message passed straight through.

So two of three flows are oracle-free by deliberate design and the third is not. The report is
right that this is an *inconsistency with a documented posture*, which is what makes it worth
fixing even at P3.

**Honest severity read, since the fix has a real UX cost.** Sign-up enumeration is a weaker oracle
than sign-in enumeration: any sign-up form that refuses duplicate emails leaks existence *by
behaviour* (it either succeeds or it doesn't), so suppressing the message narrows the channel
rather than closing it. Genuinely closing it means always claiming success and sending a
"someone tried to register your address" email — a much larger change, and not what was asked
for. The code-based suppression in the report is the right-sized fix; **it should ship with a
comment saying it narrows and does not close the oracle**, so the next reader does not mistake
it for a guarantee.

Also note line 123 (`Google sign-in could not be started`) passes `err.message` through too —
different flow, probably not an existence oracle, but check it while you are in the file.

**Plan:** suppress only account-existence codes (`user_already_exists`, `email_exists`), pass
other validation errors through. **Verify the actual code strings against the installed Better
Auth version before writing them** — a hardcoded code that never matches is an unearned green.

**Exit test:** stub the auth client to return each code; assert the generic string for the
existence codes and the passthrough for a validation code.

---

## B10 — `.docx` entity decode throws `RangeError` (#106, P3)

Introduced `a557ed8` (2026-08-03). **Confirmed by read** — `web/src/lib/user-corpus/parse-docx.ts:189-190`
call `String.fromCodePoint(Number(d))` and `String.fromCodePoint(parseInt(h, 16))` with no bounds
check. `web/src/verifier/normalize.ts:43-44` has the correct guard
(`if (!Number.isFinite(cp) || cp < 1 || cp > 0x10ffff) return m;`) and predates the docx parser by
a month.

**The retry-classification half of the report is the part that matters.** The upload queue treats
only `UploadRefused` as permanent, so a `RangeError` is retried three times before failing with a
confusing message. That is wasted work on a deterministic input — the same bytes fail identically
every time.

**This file already carries one ReDoS CRITICAL fix (`1ab40de`, per MASTER lane C4).** It is a
hostile-input parser on a user-upload path; treat findings here as security-adjacent even when
filed P3, and run `/security` on the change.

**Plan:** copy the `normalize.ts` guard, returning the original entity text unchanged. Then check
whether the queue should classify malformed-document errors as permanent — that is a second,
separate question; file it rather than fixing it in the same commit if it grows.

**Exit test:** a minimal valid ZIP with `word/document.xml` containing `&#1114112;`; assert the
parse returns with the entity preserved rather than throwing. Red-proof: `RangeError: Invalid
code point 1114112`.

---

## B11 — upload quota TOCTOU (#116, P2)

Introduced `957c860` (2026-08-21). **Confirmed by read** — `web/src/lib/user-corpus/quota.ts:40-44`
is a plain `SELECT count(*) / sum(byte_size)` through `runAsUser` with no lock; the upload route
calls `checkUploadQuota` at line 71 and `createDocument` at line 79, in **separate** `runAsUser`
calls and therefore separate transactions. Nothing serialises the two.

The report's precedent check holds: `web/src/lib/user-corpus/queue.ts` and
`src/ingest/reingest-guard.ts` both use Postgres locking and document TOCTOU explicitly. This
path was written without it three weeks later.

**Severity — P2 looks right, and here is the honest bound.** The exploit is not unbounded: the
rate limiter caps 10/min and 100/day, so a user at 199 documents can overshoot by roughly the
number of requests they can land inside one check window, not by thousands. The byte quota is the
sharper edge — 100 MB overshoot per concurrent request costs real embedding spend, and embedding
cost is the reason the quota exists. Frame the fix around bytes, not document count.

**Plan — this one needs a decision before code, so it is PLANNED-BLOCKED, not ready:**
- Option A: `pg_advisory_xact_lock(hashtext(userId))` + do check and insert in one `runAsUser`.
- Option B: move quota enforcement into `createDocument` so read+write are one transaction.

B is cleaner and removes the ability to call the check without the insert; A is smaller and keeps
the check reusable for a pre-flight UI. **Recommend B**, with A's advisory lock inside it. Either
way the change touches the upload route's error shape (the quota refusal must still surface as
the same user-facing message), so check what the route returns today before moving the check.

**Exit test:** two concurrent `createDocument` calls against a user seeded at the limit − 1;
assert exactly one succeeds. Red-proof: both succeed today.

---

## B12 — gazetteer label `Easter` over-anchors (#115, P2)

Introduced `d711e60` (2026-08-20). **Confirmed by read**, and the matcher makes it worse than the
report states:

```ts
// src/ingest/history-gazetteer.ts:78
{ slug: 'easter-controversy', label: 'Easter', kind: 'event' },

// src/ingest/history-gazetteer.ts:127-132
export function verbatimAnchors(heading: string, body: string): GazetteerEntry[] {
  const hay = `${heading}\n${body}`;
  return HISTORY_GAZETTEER.filter((g) =>
    [g.label, ...(g.aliases ?? [])].some((s) => hasWord(hay, s)),
  );
}
```

It is a bare whole-word match over heading **plus full body**. Any section anywhere in a historian
work that says "Easter" once — a resurrection narrative, a Passion Week chapter, a passing mention
of the calendar — gets anchored to `easter-controversy`. On sources like Schaff HCC Vol I or
Edersheim that is not an edge case, it is most of the mentions.

**This is the only bug in the sweep that has already written wrong data.** The other eleven are
latent. `section_history_anchors` rows exist from the `d711e60` ingest run, so there are two
pieces of work here and they have different owners:

1. **Code fix (mine):** relabel to `'Easter controversy'` with `aliases: ['Quartodeciman',
   'Synod of Whitby']`, as recommended. Cheap and obviously right.
2. **Data cleanup (owner's call, per AGENTS.md — no production write without an explicit go):**
   the existing false anchors. Do **not** issue a delete. Produce a count first: how many
   `entity_slug = 'easter-controversy'` rows exist, and how many of those sections contain none
   of the controversy-specific terms. That number is the decision input; the deletion is the
   owner's to authorise.

**Related, already on the board:** MASTER lane F4 files a "50-entity out-of-scope population" as a
historians-lane finding. **Check whether this Easter entry is inside that population before
treating it as new** — it may already be counted, and double-filing it would inflate the count.

**Wider question this raises, worth one pass and no more:** if `Easter` slipped through, other
bare labels in the 42-entry gazetteer may have the same holiday-vs-event or person-vs-place
collision. A quick read of all 42 labels costs minutes and is the difference between fixing one
row and fixing the class. Do that read; report what it finds rather than silently expanding scope.

**Exit test:** `verbatimAnchors('', 'He rose on Easter morning.')` must not return
`easter-controversy`; `verbatimAnchors('', 'the Quartodeciman dispute')` must. Red-proof first.

---

## B13 — annotation rollback overwrites newer state (#114, P2)

Introduced in PR #54 / `96b1e08`. **Confirmed by read** of `web/src/lib/use-annotation-writes.ts`:

| Function | Rollback | Line |
|---|---|---|
| `addHighlight` | **identity-based** — filters out only the span *this* op added | 230 |
| `clearVerse` | `setHighlights((cur) => new Map(cur).set(verse, previous!))` — blind overwrite | 277-279 |
| `saveVerseNote` | rebuilds the map entry from `previous` unconditionally | 301-305 |
| `deleteVerseNote` | `setNotes((cur) => new Map(cur).set(verse, previous!))` — blind overwrite | 331-333 |

So the correct pattern is already in the file, at the top, with a comment explaining it
(line 62: *"identity-based (the object addHighlight ...)"*). The three functions below it do not
follow it. That is the whole bug, and it makes the fix low-risk: the intended shape is not in
dispute.

**The test-lock is the part to handle carefully.** The report notes that
`annotation-write-failure.test.tsx:103` asserts *"clearing a verse restores its EXACT prior spans
on failure"* — i.e. **an existing green test encodes the buggy behaviour.** Under CLAUDE.md's UX
rule the exit test is written first and the fix changes, never the test — but that rule assumes
the test is right. Here it is a test that pinned a behaviour nobody had thought about
concurrently. Per the same rule: **stop and flag rather than quietly edit it.** The honest
sequence is (a) write the new concurrent-write test, watch it RED; (b) show that the old test and
the new one cannot both pass; (c) record in this file that the old assertion was narrowed and
why, before changing it. Do not just delete it.

**Scope caution:** the report's suggested rollback for `clearVerse` ("don't restore if
`current.length > 0`") is not obviously right — a concurrent *partial* change would still be
clobbered, and a legitimate empty-then-refill sequence would be skipped. Think about what
"only revert what I changed" means for a whole-verse clear before copying the snippet. This one
deserves its design thought written down; it is the least mechanical fix in the sweep.

---

## B14 — interlinear toggle missing `aria-pressed` (#109, P2)

Introduced `e171de8` (the Visual Redesign PRD, PR #76).

**File-path correction:** the issue header links `web/src/app/library/word-study/page.tsx`. **The
code is not there.** The button is `web/src/components/reader-header.tsx:84-96`, which the issue
body names correctly. Second wrong header link in this batch (B5 was the first) — **check the
body's path, not the header's, on every remaining issue.**

**Confirmed by read** of `reader-header.tsx`:

- line 73 — highlight-mode toggle: `aria-pressed={!!highlightMode}` ✓
- lines 85-88 — interlinear toggle: `onClick`, `title`, conditional class on `interlinear`, **no
  `aria-pressed`, no `aria-label`** ✗

Same component, adjacent buttons, one has it and one does not. The regression story checks out:
the state was added in an accessibility pass and removed by a 104-file restyle.

**Note the two missing attributes, not one.** The report's fix line restores `aria-pressed` only;
its History paragraph says `aria-label="Greek and Hebrew interlinear"` was dropped too. A screen
reader on `אα` with only a `title` is a poor name even once the state is exposed. Restore both.

**Exit test:** the report names existing precedents (`work-header-save-shelf.test.tsx`,
`study-editor.test.tsx`) that already assert `aria-pressed` on toggles — copy one. Red-proof by
running it against the current component.

**Not `AGENT`-closable alone.** Under the UX_REMEDIATION rules a rendered check is `BROWSER` and I
must not mark it. The unit test is mine; the "actually loaded at 390px and desktop, no console
errors" leg is not.

---

## B15 — `runScreens` reports only the first hit per pattern (#107, P2)

Introduced `5e88b72` (2026-07-05). **File-path correction (third this batch):** the header links
`web/src/verifier/v1.ts`; the function lives in **`src/verifier/screens.ts` / `web/src/verifier/screens.ts`**
(`v1.ts:262` merely consumes it). The body gets it right.

**Confirmed by read** — `screens.ts:39-46`:

```ts
export function runScreens(text: string): ScreenHit[] {
  const hits: ScreenHit[] = [];
  for (const s of SCREENS) {
    const m = text.match(s.pattern);
    if (m) hits.push({ rule: s.rule, label: s.label, span: m[0] });
  }
  return hits;
}
```

All ten patterns are non-global (`/i`, never `/gi`), and `.match()` without `g` returns the first
match only. The file header two lines above says *"Collects ALL violations (not fail-fast) so
regeneration feedback is complete."* Implementation and stated contract have disagreed since day
one, as reported.

**Correction to how this reads, and it matters more than the fix.** The title and the P2 make this
look like a verifier hole. **It is not one, and I want that on the record before anyone reruns a
gate over it.** `v1.ts:262` pushes a violation for *every* hit returned, and a single violation
rejects the answer. One hit is sufficient to reject — so **no unfaithful text reaches a user
because of this bug.** The faithfulness guarantee is intact; the `interpretation_bait` numbers are
not called into question by this finding. What is actually degraded is the *quality of the
regeneration hint*: attempt 2 gets told about one prescriptive phrase when there were three, so
it may fix one and re-offend, burning the `MAX_RETRIES=2` budget and falling through to the
fail-closed raw-retrieval path. That is a **wasted-retry and answer-availability** cost, not a
safety cost. Fix it for convergence, and do not let it be written up as a breach.

**Plan, and the two traps in it:**
1. Add `g` to all ten patterns and switch to `matchAll`, per the report.
2. **Trap 1 — shared mutable regex state.** `SCREENS` is a module-level array of `RegExp` objects.
   With a `g` flag, `.exec()`/`.test()` on a shared instance carries `lastIndex` between calls and
   silently skips matches. `matchAll` is safe (it clones internally and throws on a non-global
   regex), and `grep -rn SCREENS` shows the only two consumers are the two copies of `runScreens`
   itself — so this is safe **today**. Add a one-line comment saying why the `g` is load-bearing,
   or the next person adding a `.test(...)` on `s.pattern` reintroduces it invisibly.
3. **Trap 2 — the sync guard.** `src/verifier/screens.ts` and `web/src/verifier/screens.ts` are in
   the integrity core enforced byte-identical by `test/web-core-sync.test.ts:20`. They are
   identical right now (verified with `diff -q`). Change both or the gate goes red — which is the
   guard doing its job.

**Exit test:** text with three distinct second-person prescriptives; assert three `screen:I3`
violations. Red-proof: one, today. Add a duplicate-span case too, and decide explicitly whether
identical repeated spans should dedupe — three copies of the same phrase producing three
identical violations makes noisier feedback, not better feedback.

**Re-run after:** the verifier suites plus `test/web-core-sync.test.ts`. Because this changes what
the regeneration prompt is told, it is a compose-loop behaviour change — a bait re-run is the
honest check before this ships, and its result belongs in this file.

---

## Intake queue

_(more bugs land here as they are pasted)_
