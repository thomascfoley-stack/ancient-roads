# W-SEC-CCEL — `(CCEL)` hardcoded provenance in copied history citations

**Status:** FIXED + AUDIT (every gate green EXCEPT the vitest leg's single baseline-red test owned by W-BASEFIX — not this branch's defect, resolves when `swarm/w-basefix-thayers-guard` merges at Wave 8) → pending Wave-7 verification, Wave-8 merge
**Worktree:** /tmp/swarm-W-SEC-CCEL · **Branch:** swarm/W-SEC-CCEL-ccel-provenance · **Base:** 9dce273ef09dffb03bc547cead0431f48fb71ffe (origin/main)

## Finding

WORKLOG 2026-08-21 deferred security finding "`(CCEL)` hardcoded provenance". Located at
`web/src/components/history-results.tsx` (copy-citation button): every copied citation was
suffixed ` (CCEL)` regardless of the work's real provenance. False attribution, not hypothetical:
of the 29 `source_type: historian` manifest entries, `josephus-whiston` is CrossWire-provenanced
(`provenance.url` = crosswire.org SWORD module), so its citations claimed a CCEL source it does
not have. The order brief resolved the WORKLOG entry's intent: **derive from the source record**.

## Fix (least code)

The source record is `sources.provenance` JSONB; its `url` is the record's own declaration of
where the text came from. The citation's short provenance tag is now the host of that URL,
derived server-side:

- `web/src/lib/history-search-db.ts` — `ROW_COLS` gains `src.provenance->>'url' AS provenance_url`;
  new exported `provenanceHostOf(url)` (host, `www.` stripped; null → null, unparseable → null);
  `WorkRef` gains `provenanceHost`, populated in the groups builder.
- `web/src/components/history-results.tsx` — `cite()` appends ` (${work.provenanceHost})` when
  present, nothing otherwise. `HistoryPayload` work shapes gain `provenanceHost?: string | null`
  (optional: threads persisted before this field render with NO tag — an absent tag beats an
  invented one; fail-closed matches the product's attribution rule).

Result: CCEL works cite `(ccel.org)`, josephus-whiston cites `(crosswire.org)`, a work with no
recorded provenance URL cites no provenance at all.

Cost of not fixing (§2.5): every copied citation for a non-CCEL work is a false attribution —
on an attribution control, the exact class the product exists to not be.

## Tests

- `web/test/invariants/history-citation-provenance.test.tsx` (new, jsdom) — clicks the copy
  button: a CrossWire-tagged work yields `(crosswire.org)` and never `(CCEL)`; a legacy
  tagless payload yields the exact citation with no tag.
- `web/test/history-provenance-host.test.ts` (new) — pins `provenanceHostOf` against the two
  real served-history provenance URLs + fail-closed cases, and pins the SQL half
  (`ROW_COLS` must select `src.provenance->>'url'`), per the two-place lesson of the
  deep-link CRITICAL.

## Evidence (docs/evidence/swarm-2026-08-22/w-sec-ccel/)

- `red-new-tests-on-base.txt` — RED before the change: 5/5 new assertions fail on base code;
  the captured citation text shows the live defect ("Josephus, Works, … (CCEL)").
- `green-after-fix.txt` — 9 history test files, 42/42 pass after the fix.
- `redproof-mutation-hardcode.txt` — §2.2 red-proof 1: re-seeding the hardcoded ` (CCEL)` in
  `cite()` turns the component test red (2 failed).
- `redproof-mutation-constant.txt` — §2.2 red-proof 2: making `provenanceHostOf` return a
  constant turns the derivation test red (2 failed, 1 passed — the ROW_COLS pin survives,
  correctly).
- `audit.txt` — `npm run audit` in the worktree (result recorded in Transitions).

## Spend (A1)

$0.00 — no provider calls; all tests are mock/jsdom-based. (No embeddings, no eval runs.)

## Transitions

- 2026-08-23 **CLAIMED** — worktree + branch from origin/main 9dce273; bootstrap per §2.7 plus
  `cp -c -R web/node_modules`; both env files silently verified clean (booleans only:
  root-env-match=0, web-env-match=0) and copied.
- 2026-08-23 **RED-PROVEN** — new tests watched red on base code; both mutation red-proofs
  watched red (transcripts above).
- 2026-08-23 **FIXED** — derived provenance shipped; 42/42 history tests green.
- 2026-08-23 **AUDIT** — full `npm run audit` in the worktree (`audit.txt`): every gate green
  EXCEPT the vitest leg's single failure, `test/publish-flip-toolchain.test.ts:473` ("the
  SHIPPED CLI refuses at the same gate"), 847/848 passing. **This is the known baseline red
  owned by W-BASEFIX, not caused by this branch:** the leg asserts
  `docs/evidence/thayers-source-verification.md` absent, and that evidence file was
  legitimately committed in `abe5252` (ancestor of base). W-BASEFIX's item file
  (`items/w-basefix.md`, VERIFIED) documents this exact failure as the Wave-0 baseline red and
  ships the repair on `swarm/w-basefix-thayers-guard`; it resolves at Wave 8 merge. This
  branch's diff touches nothing in its path. Both new test files ran inside the audit's qa leg
  and passed (`audit.txt` lines 821, 1029). Not a bootstrap-transient leg, so no rerun — the
  failure reproduces statically from the base tree state.
- **Owner packet:** nothing required. No prod touch, no migration, no config/env/dependency
  change; the derived tag rides the existing payload shape (optional field, old persisted
  threads render tagless rather than falsely tagged).
