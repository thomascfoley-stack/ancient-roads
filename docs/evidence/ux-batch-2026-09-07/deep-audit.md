# Deep audit — pre-deploy sweep of the merged `redesign/ask` tree (2026-09-07)

Four lenses, one parallel batch, read-only, non-overlapping: attack surface + AI pipeline · client
+ accessibility · data/ops/deploy/docs · tests as evidence (false confidence). Scope: the diff versus
live `d6e85f3` at `1f30752c` (Sidebar C, the four UX sweeps, the session-mock fix, the build menu).
Each lens returned findings with file:line, a verified-clean list and a not-covered list. The
authors of the sweeps did not audit their own work.

**Reframing finding:** nothing CRITICAL. The four HIGHs were all on surfaces the sweeps had just
touched and mis-finished — a rate-limited sign-in reported as a wrong password on the exact line the
error-voice sweep rewrote; five bare `rounded` on the search skeleton whose header says it avoided the
house's banned classes; a status code still in the copy of a file the same sweep opened; and a hole
in the session-mock guard written that evening (a `/*` inside a line comment swallowed a whole file).
The pattern: the fix and the check were made by the same hand in the same hour.

## Fixed before deploy

| # | Lens · severity | What | Where |
|---|---|---|---|
| 1 | attack · HIGH | A 429 from the auth server (`over_request_rate_limit`) hit the curated credentials sentence — "do not match an account" / "reset link has expired" — sending a throttled reader to a reset. Now a throttle sentence, checked first (D41). The generic fallback no longer blames the reader's connection. | `auth-forms.tsx` |
| 2 | attack · MEDIUM | Change-password classified only the resolved `{error}` shape; the shim THROWS on 4xx, so a wrong current password landed on the generic line. One classifier for both paths; an empty message is no longer "not correct"; 429 handled. | `account-settings.tsx` |
| 3 | attack · MEDIUM | Teacher failures were logged only while the socket was still open — a DeepInfra 5xx after the reader backgrounded the tab vanished. Now the discriminator is the error (an `AbortError` is silent), not the signal's current state; the client write alone is gated. | `api/ask/stream/route.ts` |
| 4 | attack · MEDIUM | `controller.enqueue` unguarded after the abort check (a race); a throw would surface as a teacher failure and re-throw from the catch. Guarded and recorded. | `api/ask/stream/route.ts` |
| 5 | attack/ops · MEDIUM | `/commentaries` cached a day fresh + a week stale on URLs that are not content-hashed while the corpus is re-synced without a deploy; in production the path is rewritten to the Blob store, so "no Cache-Control at all" was a local measurement. 5 min + 1 h; comment corrected. | `next.config.ts` |
| 6 | client · HIGH | Five bare `rounded` on the new `/search` loading screen. | `app/search/loading.tsx` |
| 7 | client · HIGH | The rail's research delete control was ~27px in the mobile sheet. 44px in the sheet, a 32px square on the desktop rail. | `sidebar.tsx` |
| 8 | client · HIGH | A failed delete set the LOAD error flag: "Could not be loaded." over a list that had loaded, for the life of the mount, unannounced. Its own `role="alert"` line, cleared on the next attempt. | `sidebar.tsx` |
| 9 | client · HIGH | `The tradition could not be loaded. (${status})` — a status code in copy, in a file the error-voice sweep had opened. Curated sentences. | `work-beside-tradition.tsx` |
| 10 | client · MEDIUM | Duplicate `id="rail-group-*"` and dangling `aria-controls` whenever the phone Menu sheet is open (the hidden desktop rail is still in the DOM). Ids suffixed by instance; `aria-controls` only while open. | `sidebar.tsx` |
| 11 | client · MEDIUM | Two new `border-stone-50 dark:border-stone-800` pairs — the layered pair the stylesheet measures as broken; the dark composites showed bright hairlines. An unlayered `.rail-rule`, applied to all four rail dividers. | `globals.css`, `sidebar.tsx` |
| 12 | client · MEDIUM | `aria-busy` on a plain div announces nothing; three sites lost their `role="status"`. The wrapper is a status region. | `skeleton.tsx` |
| 13 | client · MEDIUM | `The search failed: {state.error}` — a job's raw error string rendered. | `suggested-readings.tsx` |
| 14 | client · MEDIUM | The rail's own open-group state printed the literal "Loading…" the same branch was eradicating. `TextSkeleton`. | `sidebar.tsx` |
| 15 | client · MEDIUM | Side effects inside state updaters (`previous` captured in `setItems`, `localStorage` written in `setStored`) — impure under StrictMode's double invocation. Refs. | `sidebar.tsx` |
| 16 | client · LOW | More/Fewer disclosure without `aria-expanded`; the expanded aside without `aria-label`; session overrides not cleared on a change of user. | `sidebar.tsx` |
| 17 | ops · MEDIUM | The icon rail hand-typed its two visitor rows ("My prayers") beside a group named "Prayer journal" per the §2 lock — the second hand-kept list the file's header warns about; ADR-122 claimed derivation. Derived from `VISITOR_ROWS`; the writing-rail test re-pointed to the locked name. | `sidebar.tsx`, `sidebar-writing-rail.test.tsx` |
| 18 | ops · BLOCKING | `test/publish-flip-toolchain.test.ts:491` ran the CLI without `--evidence=`, writing `flip-run-*.log` into tracked evidence on every audit — and `deploy.sh` then refused the tree. Filed 2026-09-06; fixed. | `test/publish-flip-toolchain.test.ts` |
| 19 | ops · LOW | `served-assets-baseline.json` had `devotional: 2` against 734 on disk; the ratchet would not have noticed 730 shards vanishing. Re-recorded deliberately. | `docs/evidence/served-assets-baseline.json` |
| 20 | tests · HIGH | `session-mock-surface.test.ts`'s comment stripper: a `/*` inside a `//` line (`/api/*`) opened a phantom block comment that swallowed `db-fault-returns-envelope.test.ts`'s real mock; the floor (15 of 21) hid it. Single-pass tokenizer that keeps strings; a positive control (raw-text set = stripped set); floor 20. | `session-mock-surface.test.ts` |
| 21 | tests · MEDIUM | Two focus-restore assertions that could not fail (focus never left the trigger). Preconditions added; the export leg moves focus into the menu first. | `dialog-semantics.test.tsx` |
| 22 | tests · MEDIUM | A tap-target loop with no count guard; the copy button measured on one axis. | `tap-target-floor.test.tsx` |
| 23 | tests · LOW | `toContain('edge')` over innerHTML → the class; a tautological ancestor search → the control sits in its thread's row; P2b renamed to what it proves; the render harness asserts each state before writing it. | `search-loading`, `sidebar-groups`, `ask-abort-stops-spend`, `sidebar-groups-render.snapshot` |
| 24 | ops/docs · HIGH | UX_REMEDIATION still filed "Stop stops waiting only" as open; the build menu listed eleven done rows as ready and said "a count when closed" against ADR-122; ADR-122 cited a stale suite log without saying at which tree; commit counts stale. All corrected. | `docs/` |

## Filed, not fixed (none blocks this deploy)

- **The hidden desktop rail fetches on a phone** — below `md` the rail is `display:none` but mounted,
  so on `/ask` the research group opens and fetches once for a rail nobody sees; opening the sheet
  fetches again. One bounded request per owning route. (client · MEDIUM)
- **The marketing wordmark at 375px** now shares its row with two pills; it may wrap. The a11y sweep
  verified no horizontal overflow at 375; the wrap itself needs a browser look. (client · MEDIUM)
- `aria-modal="true"` on two anchored popovers overclaims; `aria-haspopup="menu"` on a panel with no
  menu role; bare `rounded` at two pre-existing sites in `study-editor.tsx`; an unvalidated
  `JSON.parse … as StudySection[]` on the legacy sections (pre-existing); `onBlur` disarm never fires
  on iOS Safari for `<button>` taps (pattern-wide); the notes page's remove error outlives the
  failure. (client · LOW)
- **An already-aborted request still writes the thread + question row** before `teach()` (I-2 was
  decided for a crash, not a disconnect); an abort landing after the final verify still persists
  (narrow, safe). Whether Vercel's runtime propagates a client disconnect to `req.signal` is
  asserted by tests, not measured live. (attack · LOW; **the live measurement is owed**)
- Annotation DELETE answers `ok:true` for a row that matched nothing, so a stale row disappears and
  returns on reload. (attack · LOW)
- The year devotional files (2.24 MB) still ship though no client path reads them — the script and
  two tests do. Deliberate for now. (ops · LOW)
- Six `small-caps` sites still carry the undefined class (`studies/page.tsx`, `plans-client.tsx`,
  `study-library-panel.tsx`, `selection-popover.tsx`). (ops · MEDIUM → A16)
- The marketing nav focus-order test carries a hand-maintained roster. (tests · LOW)
- Three low test holes left as noted by the lens: the `use-dialog` third leg, `today-view-timeout`'s
  "unaffected" leg, `auth-error-voice`'s sentence regex. (tests · LOW)

## Coverage

**Audited:** every file in the diff across the four lenses; the abort plumbing end to end
(route → teach → DeepInfra); every delete helper's user predicate; the CSRF floor on DELETE; the
new cache rule against the rewrite and the deploy guards; all 732 shard files byte-compared against
the year files (0 drift, 1,464 attribution fields present); the served-asset gate executed against
the tree; ADR-122's seven clauses against source and test; every new and re-pointed test read for
vacuity, 25 files run.

**Not covered:** no lens drove a browser (the client findings on the wordmark and the dark dividers
are reasoned from CSS and the composites); `CORPUS_CDN_BASE`'s production value was inferred, not
read; whether `req.signal` fires on disconnect under Vercel's runtime; the `as never` at
`upload-direct-guards.test.ts:161` (untouched by this diff, recorded 2026-08-31, still owed); the
root `test/` suite beyond the residue generator.
