OUTCOME: **MAY MERGE, WITH CONDITIONS, AND WITH ONE STRUCTURAL CAVEAT THE OWNER MUST WEIGH.** No confirmed BLOCKER survived verification: the single BLOCKER raised was DOWNGRADED by its own verifier. Forty-eight findings were raised across six lenses over the fourteen commits `29d6f98..b449947`; twenty-three reached an adversarial verifier before the run hit its session limit; twenty were CONFIRMED, two DOWNGRADED, one REFUTED. Twelve confirmed defects are now fixed and re-proved on this branch (`cf7c65d`, `7180306`, `fd7a791`, `5b94a4a`), including a printed A4 command that its own guard would have refused, two spoofable-host holes in that guard, a delta assertion blind to deletions, and six false claims in documentation. **THE CAVEAT: this audit does not satisfy bylaw 4.** It was commissioned by the session that wrote the work, and the same session applied every fix. It is a strong self-check, not the independent verdict A1 got. Whether that is enough to merge is the owner's call, not mine.

# Audit of the corrections branch, `29d6f98..b449947`

**Filed 2026-08-02.** Ran overnight 2026-08-01 as a forty-agent workflow (`wf_85fdb44b-442`,
39.6 minutes, 736 tool calls, `claude-fable-5`), three phases: six audit lenses, adversarial
verification of each finding, then one synthesis. **The synthesis agent died on the session limit
before writing anything.** This document is that missing synthesis, reconstructed from the run
journal by the commissioning session.

---

## 0. The seat check, and why it fails

Every prior audit in this repo opened by proving the verifier did not write the work. This one
cannot.

I commissioned this audit. I wrote all fourteen commits in the audited range. I read the findings,
I decided which were real, and I wrote every fix. Bylaw 4 says fixer is not verifier, and here they
are the same seat.

What partially substitutes:

- The forty agents were independent **of each other and of my reasoning**. Each lens got the diff
  and the tree, not my account of them. The verifiers were prompted to REFUTE, and one did
  (V17), while two others cut a claim's severity down (V6, V8) rather than rubber-stamping it.
- Every finding I acted on, I reproduced myself before touching anything: the endpoint-id
  mismatch by running `declaredMatches` against the real host, the JSX-comment blind spot by
  re-seeding it, the MASTER history claim by `git merge-base --is-ancestor`, the `/api/health`
  claim by `git ls-tree` at the deployed sha.
- Every fix carries a red-proof performed in real product code and watched go red.

What does not substitute: **nobody who did not write this code has read the fixes.** The six
defects fixed at `cf7c65d` were fixed by the person who wrote the defects, checked by tests
written by that same person. That is the honest description, and it is the reason this document
recommends rather than certifies.

---

## 1. What the run actually did

| phase | agents | outcome |
|---|---|---|
| Audit | 6 lenses (tests+guards, library features, flip toolchain, documentation claims, and two sweeps) | 48 findings: 1 BLOCKER, 13 MAJOR, 21 MINOR, 13 NOTE |
| Verify | one adversarial verifier per finding, prompted to refute | 23 reached a verifier: **20 CONFIRMED, 2 DOWNGRADED, 1 REFUTED** |
| Synthesize | 1 | **died on the session limit; produced nothing** |

**Twenty-five findings never reached a verifier.** The Verify phase was still draining when the
run ended, so the unverified set is not "the ones judged unimportant" - it is "the ones the clock
did not reach". They are listed in §4 and remain open as raised, at the severity their lens
assigned. Two of them I have since verified and fixed by hand (F1, F41); the rest have not been
checked by anyone.

The three verdicts that were not a plain CONFIRMED are worth naming, because they are the evidence
that the verifiers were doing work rather than agreeing:

- **V17 REFUTED** - "the `unknown` tradition chip advertises N works and matches zero". The
  verifier could not reproduce it. No action taken.
- **V8 DOWNGRADED** - the run's only BLOCKER, "A3's NO STOP ran 1 of 4 codified STOP sections".
  The verifier's finding: **A3 correctly ran only §1** (a published-but-not-admitted work is the
  A3 rule; §2 forbidden-provenance, §3 voice floor and §4 serving counts are A5's job and were
  passed `undefined` deliberately). The real defect underneath is a type-contract one - the
  function accepts `undefined` for three of its four inputs and returns a verdict as if it had
  weighed them. Real, worth fixing, **not a blocker**, and A3's adjudication stands.
- **V6 DOWNGRADED** - "the guard pins the first DNS label but never the domain". The verifier
  agreed the hole was real but argued the downstream gates would have caught the write.
  **Fixed anyway**, because a defence that depends on a later gate is not the gate you documented.

---

## 2. The twelve confirmed defects that are now fixed

All on this branch, each with a red-proof performed in the real file.

### In the flip toolchain (`cf7c65d`)

| # | defect | why it mattered |
|---|---|---|
| V5 | **The printed A4 command was refused by its own guard.** Both scripts printed `PUBLISH_EXPECT_HOST=ep-odd-fog`; the endpoint is `ep-odd-fog-atnykudm`. `declaredMatches(host, 'ep-odd-fog')` returns `false`. | The operator would have pasted the command the tool printed and been refused by that same tool. This is the one that would have been hit first. |
| V2 | **`--local-redproof` accepted `localhost.attacker.example`.** `isLocalHost` used an unanchored `startsWith`; `localhostage.evil.io` passed too, no dot required. | That branch returns *before* the owner gate, the TTY requirement and the server-side role assert. |
| V6 | **The domain was never pinned.** `endpointId` takes `split('.')[0]`, so `ep-odd-fog-atnykudm.attacker.example` carries the genuine production id and satisfied `declaredMatches`. | Declaring the true production host still routed the write elsewhere. **My first fix pinned the label and not the domain and the spoof still passed**; it took a second pass, which is why the case is now a test. |
| V4 | **The delta assertion could not see deletions.** The loop iterated `after` only; `before.length` appeared in a log and in no comparison. | Its stated guarantee is "the ONLY rows that changed are the listed slugs". Under READ COMMITTED - never overridden anywhere in this toolchain - a concurrent DELETE showed as silent absence and passed. |
| V7 | **A third status was silently skipped.** `eligible` was the staged ones; the log then said "the rest are already published" without checking. | A `quarantined` or `ingesting` work would be skipped by the UPDATE and reported as done. |
| V10 | **The adjudicator accepted duplicates and non-slugs** into the flip list, including `x'; DROP TABLE sources; --`. | Duplicates inflate the count the delta assertion checks against. |
| V1 | **An unwrapped `new URL` printed the connection-string password** in Node's uncaught-exception report, bypassing the scrubbing `die()`. | |
| V3 | **The adjudicator matched production by naive substring.** `ep-shadow-ep-odd-fog-9999` passed. | Every sibling in the toolchain imports `target-guard`; this one re-typed the constant. |

### In the library and API (`7180306`)

| # | defect |
|---|---|
| V11 | **Every catalog filter link dropped `?desk=`.** One chip click turned a three-pane desk into a one-pane desk, silently. Fixed by making `lib/catalog-href.ts` the single URL builder over the whole facet state, so a facet cannot be dropped by a link that predates it. |
| V13 | **Prototype-chain sub-filters returned 500.** `?sub=constructor` yielded the Object constructor - truthy, not an array - which threw on a spread with no `try/catch` above it. |
| V14 | **Unknown sub-filters silently widened to the whole catalog.** `sub` has a closed valid set, so the argument that justifies accepting any tradition does not apply. Now 400s, naming the valid set. |
| V15 | **Non-integer `limit`/`offset` reached SQL.** `Number.isFinite` admitted `2.5`; the clamp narrows but never floors, so the float was bound into `LIMIT $5` and Postgres rejects it (22P02) as a 500. |
| V16 | **`aria-pressed` on anchors.** Valid only on role `button`; the lit state was announced by nothing. Now `aria-current`. |
| V19 | **The client half of the tradition filter had no test.** An auditor deleted `params.append('tradition', t)` - the branch's entire headline fix - and the three new test files stayed 52/52 green, the full web suite stayed 242 passed, `tsc` exited 0 and eslint found nothing. |

### In documentation (`5b94a4a`)

| # | defect |
|---|---|
| V18 | **MASTER.md falsified repo history while correcting a stale line.** It claimed the old line "was false when it was written, `bf34b21` precedes the commit that wrote it". The order is backwards: `ccf7f3c` wrote it when the file really was 25 lines, and `bf34b21` rewrote it 67 minutes later. The line was true and went stale. Compressing the A1 verdict's "false when LAST written" produced a false nativity claim, in the tranche whose purpose was to stop this board contradicting its own commits. |
| V23 | **The gate board contradicted its own tree.** A4 was "blocked on tooling that does not exist: no safe prod writer" while both the writer and the prod-capable verifier sat in the same tree, added by the immediate parent commit. |
| V22 | **"All six served dirs byte-exact" is five.** `devotional/` is in no release at all, so there is nothing to compare it against. Wrong in three places. |
| V20 | **The census headline kept the falsehood its own §5 repudiates** - "cannot be restored from anything in this repository", about a file tracked in git. A correction that does not reach the headline is a sharper version of the original error. |
| V21 | **The A3 record claimed an impossible post-flip change.** `/api/health` does not exist on the live deployment: `24677ba` has thirteen API routes and no health route, and the route was added later at `ba82a5d`, which is not an ancestor. RECOVERY.md on this same branch already said so. |
| V12 | **PUBLISH_FLIP.md - the document the owner-level go is called against - was unreconciled.** §2 pointed at the dev-only script as "the right tool to adapt" while the adaptation sat in the same tree; §3 required a rehearsal fork the rails forbid; §4 prescribed a command against a script that refuses production by design. |

### Also landed, from the hardening run the same night

Three items completed in a separate clone and never pushed; integrated here by cherry-pick
(`9bae396`, `070deb5`, `d97cd07`): the `loadLexicon` guard, the served-assets **count** ratchet
(present is not intact), and the adjudicator bound to its census by digest and declared total.

### And the finding that produced the largest change

**V9 - the flip toolchain had zero committed tests.** Its twenty-two red-proof cases were prose in
a markdown file: a record that someone once watched them refuse, on a machine, once. Nothing
re-runs it. Six defects were then found in that untested code **by reading it**, four of them
inside refusals the prose claimed had been proved.

`test/publish-flip-toolchain.test.ts` now runs 27 of those guarantees in CI. Two pure functions
came out of `publish-flip.mjs` into `scripts/lib/publish-flip-delta.mjs` to make it possible; they
were inline inside a transaction, reachable only by connecting to a real Postgres and staging a
real corpus, which is exactly why their defects were invisible.

---

## 3. Conditions on the merge

None of these blocks tonight's flip. All of them are the merge conversation.

1. **`scripts/` is outside every tsconfig.** Three real type errors in the adjudicator are
   unchecked by anything. The `.d.mts` files added at `fd7a791` cover the two new modules and are
   not a fix for the gap.
2. **The `censusVerdict` type contract** (V8, downgraded from BLOCKER) still accepts `undefined`
   for three of its four inputs and returns a verdict as though it had weighed them. A2 and A5
   are the sections that would pass them for real.
3. **Root eslint ignores `web/`.** Every pre-commit lint run on this branch reported
   "File ignored because of a matching ignore pattern" for web sources and then printed
   "lint clean". The web package lints itself in CI, so this is a misleading local signal rather
   than an unlinted tree - but the signal reads as green for files nothing checked.
4. **Twenty-five findings were never verified** (§4). They should either be verified or explicitly
   accepted before this is called audited.
5. **The em dash question** (F19). The owner's standing rule is no `U+2014` anywhere, including
   code and docs. This branch adds lines that use them - and so does essentially the whole
   repository (123 of 129 files under `docs/`, 97 under `web/src/`). Fixing only this branch's
   lines would leave the repo more inconsistent, not less. **This needs an owner ruling on scope**:
   sweep everything, sweep nothing, or apply going forward only.

---

## 4. The twenty-five findings the clock did not reach

Listed at the severity their lens assigned, unverified. Two have since been verified and fixed by
hand and are marked.

**MAJOR**
- F1 **Sidebar nav guard passes with the entire catalog nav commented out.** *Verified by hand and
  FIXED (`fd7a791`)*: the seed was reproduced exactly - wrapping the `CATALOG_IDS.map` block in
  `{/* */}` left all five source-scan cases green. The header's claim that the scan "REFUSES
  rather than under-reads" was false; every assertion was satisfied by text, and JSX comments are
  text. The file now renders the sidebar and asserts one anchor per catalog. Note the sibling fix
  (`codeOnly` from `source-scan.mjs`) would NOT have closed it: its regex does not match a line
  beginning `{/*`.
- F2 Tradition-filter wiring test guards the seam that was never broken. *Superseded by V19, fixed.*
- F3 Claim of killing the `publish-works.mjs` list is false; the copy is live.

**MINOR**
- F4 Red CI run behind the Historians-catalog story has no committed evidence.
- F5 `paneRegisterLabel` is a hand-maintained type-to-label list mirrored by its own test.
- F6 / F17 `catalog-search` comment claims comma-safety the code does not have.
- F38 Line-citation drift created by the branch's own edits.
- F39 §2 correction misnumbers `deploy.sh`'s build step.
- F40 The watchlist count-drift paragraph itself commits count drift, twice.
- F41 "248 today" for DEPLOY_PREFLIGHT's length is stale. *Verified by hand and FIXED
  (`5b94a4a`)*: it is 348.
- F42 §9 cites `.gitignore:49`, which does not exist.
- F43 The A2 README links an authorization order absent from this branch.

**NOTE**
- F7 Hardcoded-link check matches only quote forms; a template literal bypasses it.
- F8 An eviction test carries an assertion that cannot fail.
- F18 Desk tests use fictional book slugs; the chapter "range re-check" does not exist.
- F19 No slug length cap; added lines carry em dashes against the owner's rule (see §3.5).
- F31 The owner gate is typed before the snapshot and eligibility exist.
- F32 `legalCorpusFilterSha` is a char count; the census bridge hardcodes the cohort.
- F44 `flip-slugs.json`'s `legalCorpusFilterSha` is a length, not a hash.
- F45 PR #48 described as "all 21 commits"; it merged 44.
- F46 Multi-session verification claims have no committed artifact.
- F47 Not verifiable read-only: the Vercel rows, branch protection, the CI-run sha.
- F48 *Affirmative*: the A3 chain and the concordance census both reproduce.

---

## 5. What this adds to the failure-mode watchlist

Two entries, both earned by this branch rather than observed elsewhere.

**"A guard that reads text to answer a question about behaviour."** F1 and V9 are the same shape at
two scales. A source scan cannot answer "does this render a link", and a markdown file cannot
answer "does this guard refuse". In both cases the artifact that was supposed to be the check was
made of the same material as the thing being checked, so disabling the thing also disabled the
check - and in F1 the disabling comment *fed* the positive control.

**"A correction that does not reach the headline."** V20 and V18 are both this. The census
correction landed in §5 and in DEPLOY_PREFLIGHT and not in the verdict block people actually read;
the MASTER correction landed and was itself false. A repo that corrects things has to check where
the wrong claim was *read*, not only where it was written.

The existing entry these join - **"an instrument's blind spot recorded as a property of the thing
it could not see"** - was added by me on 2026-08-01 for the `devotional` mistake. V20 is that same
mistake still standing in the same file, twenty-four hours later, in the section that repudiates it.

---

## 6. Verdict

**MAY MERGE, subject to the five conditions in §3 and to the owner accepting the §0 caveat.**

The branch is materially better than it was at `b449947`: twelve confirmed defects fixed, three
hardening items integrated, 27 new tests over the toolchain that performs the irreversible write,
19 new tests over the library, and six false claims removed from the documents the flip is
called against.

It is also true that the audit that found those defects was run by the author of the defects, that
the fixes were written by the same author, and that twenty-five findings remain unverified. A
second session that wrote none of this should read at minimum `cf7c65d` and `fd7a791` before this
merges - the two commits that touch the write path.

**The owner merges.**

---

## 7. Evidence

- Run journal: `wf_85fdb44b-442` (40 agents, 39.6 min, 736 tool calls).
- Fix commits: `cf7c65d`, `7180306`, `fd7a791`, `5b94a4a`.
- Hardening integrated: `9bae396`, `070deb5`, `d97cd07`.
- Post-fix gate at the tip: root `tsc` 0, root vitest 437 passed / 1 skipped; web `tsc` 0, web
  vitest 262 passed / 80 skipped; `npm run audit` PASSED - all measured at
  `5b94a4a`, after every fix.
- Writer re-run end to end on the throwaway Postgres after the delta refactor, every exit code
  read bare rather than through a pipe: happy path 3 rows exit 0; idempotent 0 eligible exit 0;
  `--reverse` 3 rows exit 0; third status STOP exit 1 nothing moved; licence gate rolled back
  exit 1 all four rows still staged.
- A3 re-adjudicated after the merge of the hardening commits: same six works, no STOP.
