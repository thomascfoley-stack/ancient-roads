# Order — the Historians study entrance (2026-08-20)

Owner-directed in-session ("ok this is excellent we should… ship it"), recorded here per bylaw 1.
Design canvas (mockups + UX write-up, five boards + the Ask invitation board):
https://claude.ai/code/artifact/0db0e72d-4703-4999-9800-0b6ecaf5d414

## The rulings

1. **The Historians shelf leads with a question, not a search box.** `/library/historians`
   opens with "What do you want to study?" and ROUTES the question into shipped History mode
   (`/ask?mode=history&q=…`). The entrance is a router plus a reveal — it must never grow
   retrieval of its own. The classic body-text FTS survives demoted behind an "Exact-phrase
   search" reveal (the real `CatalogSearch`, not a lookalike). Other catalogs keep the search
   box: they have no History-mode equivalent to route into.
2. **The verb is "study."** "Learn about" promises the product will teach; this product
   refuses to teach by design. "Study" promises the reader will read and the product will hand
   them the sources. Example chips and the helper line carry the warmth instead of the verb.
3. **The book is the whole book.** Reading is continuous everywhere a work renders — no
   page-at-a-time. `/work` already streamed; the desk pane was the surface that did not (a
   "Read more" button after every 25 sections), and Ask results open works on the desk, so
   arrivals from a study hit exactly that wall. Closed by scroll-driven auto-load that presses
   the button early; the button survives as the fallback.
4. **Ask carries an invitation into history.** Voices-mode `/ask`'s empty state gains a
   raised-paper block in the same vocabulary as the shelf entrance — eyebrow *Church history*,
   *"Step into the story behind the text"*, concrete nouns, *Begin a study →* — a real link to
   `/ask?mode=history`. Empty state only; under an answer it would be an advertisement.

## What shipped

Commits `e64ba58` + `672513a` on `fix/q1-signed-out-state`: the entrance
(`web/src/components/study-entrance.tsx`, mounted by `library/[catalog]/page.tsx` for
historians only), the carried query (`ask/page.tsx` → `HistoryAsk initialQuery`, run once,
ref-guarded), the invitation (`ask-client.tsx`), continuous desk reading (`desk-pane.tsx` —
scroll + rect proximity, the work-reader idiom; IntersectionObserver was tried first and
delivered ZERO entries in the embedded QA browser, so it could never be watched firing and
does not ship), the history-surface restyle onto the app's tokens (`history-ask.tsx`,
`history-results.tsx`, `history-context-bar.tsx` — `rounded`/`text-muted-foreground` were
never this app's vocabulary), and `fq=` riding beside `from=hist:` so the reader's return
strip names the study.

Exit tests written first and watched red (commits e64ba58 + 672513a): 14 new tests across 5
files plus the updated deep-link invariant. The desk test caught a real defect before ship (two
same-tick auto-load fires both passing a stale `busy` closure and double-appending a page —
fixed with an in-flight ref).

## The pre-deploy deep-audit (2026-08-21) and what it changed

Five parallel lenses (attack surface · client · domain invariants · docs-vs-reality · test
honesty) swept the shipping delta. The remediation commit that followed this order carries the
fixes; the load-bearing findings:

- **CRITICAL — history deep links were unresolvable or wrong (domain finding 1).** The result
  ordinal was `sections.unit_ordinal` (the migration-024 collapsed-unit numbering), but the
  reader resolves `#s{n}` against `sections.ordinal`. Confirmed against the dev corpus: 11 of 12
  history works carry `unit_ordinal` NULL in every row → `#snull`, which opened the work at the
  top; Josephus differs in 4,110 of 4,112 rows → landed ~65% off. Every "Open in book" was
  broken. Fixed by carrying `sections.ordinal` (the column `catalog-search.tsx` already uses for
  the identical URL); the mapper is now an exported pure function with a red-proved unit test.
  This is the concordance's one job, and the entrance funnels the whole shelf into it.
- **HIGH — a failed desk auto-load stormed (client finding 1).** `error` unmounted the read; the
  scroll effect then measured the detached button (zeroed rect = "always near") and re-fired
  forever. Split into `moreError` (keeps the read, inline Retry, stops the auto-loader) + an
  `isConnected` guard.
- **HIGH — history filter state leaked across searches (client finding 2)**, manufacturing a
  false "nothing matched". Fixed with a per-search `key`.
- Copy corrected to stop over-promising: "opened to the exact page" is now TRUE (deep-link fix);
  "the church's historians" → "history's own witnesses" (Josephus is Jewish, first-century);
  "Exact-phrase search" → "Search the full text" (the reveal is a stemmed FTS). Naming lock
  (`works`→`items`), the signed-out sign-in link (Q1), aria-live on status surfaces, focusable
  fallback button, and the chunk-index citation artifact all fixed. Full finding list and
  disposition in the WORKLOG entry.

## Standing blockers this order does NOT close

- **The similarity floor** (HISTORY_RETRIEVAL_DESIGN.md §8b) is still open: a nonsense query
  still renders a confident "Closest match" hero. The entrance ships behind the SEC-1 site
  gate (owner-only), so no real user meets it — but the floor must land before this entrance
  is anyone's front door. It is the first work item of the public-launch path for this surface.
- Signed-in verification of the results restyle and the named return strip was NOT possible in
  the QA browser (no credentials; entering passwords is out of bounds for the agent). Unit
  tests cover both; the owner should eyeball one real study on prod after deploy.
