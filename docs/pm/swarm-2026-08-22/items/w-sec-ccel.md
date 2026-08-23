# W-SEC-CCEL — hardcoded `(CCEL)` provenance on copy-citation

**Workstream:** W-SEC-CURSOR (branch `swarm/W-SEC-CURSOR-sections-cursor`, base `origin/main` 9dce273)
**Status:** AUDIT-GREEN but for one pre-existing baseline red owned by swarm/w-basefix-thayers-guard (see Audit section) (transitions: CLAIMED → RED-PROVEN → FIXED → AUDIT-GREEN; VERIFIED/MERGED = Wave 7/8)
**A1 provider spend:** $0.00.

## Defect
`web/src/components/history-results.tsx:76` — the "Copy citation" button copied
`{author}, {title}, {heading} (CCEL)` for EVERY work. The served history shelf is not all
CCEL: dev's one published historian, `josephus-whiston`, records CrossWire SWORD provenance
(live dev-DB read, read-only — see FINDING.md). A false provenance assertion on an
attribution control. Cost of not fixing: every copied citation from a non-CCEL work
misattributes its source — the exact failure the provenance discipline exists to prevent.

## Intent resolution (the WORKLOG entry names no replacement)
The 2026-08-21 entry says only "`(CCEL)` hardcoded provenance". Per the brief, replacement
must "derive from the source record" — and the repo's RULED policy decides the form:
GO_LIVE A5 "attribute to the author, never a host" (commentary-panel.tsx:331-341),
`provenance` is never selected server-side so no host URL reaches a response
(work.ts:11, work-header.tsx:5), and the canonical copy idiom (lib/copy-format.ts)
carries author/work label only. Piping a provenance-derived host tag to the client would
contradict A5 and the response whitelist — an owner-level design change. So the fix DELETES
the hardcoded tag (§2.5: deletion is an allowed remedy); the citation now carries exactly
what the source record supports. If the owner wants a truthful provenance label surfaced,
that is theirs to rule. Full reasoning: docs/evidence/swarm-2026-08-22/w-sec-ccel/FINDING.md.

## Fix
`web/src/components/history-results.tsx` — the ` (CCEL)` suffix removed from the copied
string; comment records why.

## Evidence (docs/evidence/swarm-2026-08-22/w-sec-ccel/)
- `FINDING.md` — defect, live dev-DB provenance proof, intent resolution.
- `RED-citation.txt` — the new test watched red: copied string was
  `Josephus, Works, Antiquities — Book 15 — Ch. 1 (CCEL)`.
- `REDPROOF-seeded.txt` — tag seeded back → 1 test failed; fix restored → 6/6 green.

## Tests
`web/test/invariants/history-results.test.tsx` — new case drives the real Copy-citation
button and asserts the clipboard payload is `author, title, heading` with no host tag.

## Audit (2026-08-23, worktree /tmp/swarm-W-SEC-CURSOR)
`npm run audit` full log: docs/evidence/swarm-2026-08-22/audit-full-W-SEC-CURSOR.log.
Every leg green EXCEPT `tests + coverage — vitest`, which fails on exactly one test:
`test/publish-flip-toolchain.test.ts > thayers evidence gate` — a PRE-EXISTING BASELINE RED
at base 9dce273 (the evidence file it asserts absent, docs/evidence/thayers-source-verification.md,
is tracked at the base commit; verified via `git ls-files`), owned by the separate pushed
workstream `swarm/w-basefix-thayers-guard` ("repair stale thayers evidence-gate guard
(baseline audit red)"). Not caused by, and not fixed by, this branch (no opportunistic fixes).
One earlier failure of my own (web/test tsc on plan-day-toggle.test.tsx) was fixed and the
leg rerun green. NOT RUN inside the audit: `protected-branches-exist` (missing NEON_API_KEY —
declared loudly by the harness itself).
