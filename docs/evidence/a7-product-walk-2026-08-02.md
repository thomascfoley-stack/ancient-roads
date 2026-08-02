# A7 — product walk, results

Walked against the live deployment `dpl_3pbnsm9c3CKi5rKhsTNzVbnCprtR` (`ancientpaths.app`), logged in
via the site password, driven through the Claude-in-Chrome browser tools. Journey list and its
provenance: [`docs/pm/orders/2026-08-02-a7-product-walk.md`](../pm/orders/2026-08-02-a7-product-walk.md).

**12/12 journeys PASS. 2/2 cross-cutting checks PASS.** No licensing, attribution or interpretation
breach. One initial misread, corrected by re-checking the mechanics before reporting it — recorded
below because a false finding not written down is a false finding not learned from.

## Journeys

| # | Journey | Result |
|---|---|---|
| J1 | `/home` loads | **PASS.** Evening devotional for the correct local date/time (Sat Aug 1, 17:16 PDT = Sun Aug 2 00:16 UTC — the page reads local time correctly, not a bug) |
| J2 | `/read/jhn/1` (canonical slug) | **PASS.** Chapter renders, WEB translation, verse numbers |
| J3 | `/read/john/1` (natural name) | **FAIL — confirmed, filed below** |
| J4 | Commentary panel on a verse | **PASS.** 15 entries on John 1:1, grouped Early Church / Reformation / Modern / Theology & confessions. Every author on the published allowlist: Chrysostom ×3, Augustine, Calvin, Matthew Henry, Wesley, Adam Clarke, Aquinas (trans. Newman), Hodge. No quarantined or in-copyright author anywhere in the panel — the strongest live confirmation of C2 this session has produced |
| J5 | `/library` | **PASS.** Commentaries: 6 works (matches A4's flip exactly). Sermons/Hymns & Poetry/Historians: 0 works — correct, not a defect: A8 (register ingest → publish registers) is blocked on A7 and has not run; nothing but the six flat-pool commentary works exists in `sources` yet |
| J6 | `/library/commentaries` | **PASS** |
| J7 | `/library/sermons` | **PASS.** Clean "No works here yet." empty state, search box present, no error — correct pre-A8 behaviour, rendered gracefully rather than erroring |
| J8 | `/library/hymns-poetry` | **PASS** (same empty-state shape as J7) |
| J9 | `/library/historians` | **PASS** (same) |
| J10 | `/library/passages` — search "grace" | **PASS.** 1000+ results (the documented `COUNT_CAP`), highlighted matches, full attribution + year + tradition tag per result, tradition facets (Methodist/Nonconformist/Presbyterian/Reformed Baptist) matching the six published authors |
| J11 | `/library/word-study` | **PASS.** Greek/Hebrew toggle, "5,523 greek entries", Strong's-number-aware placeholder |
| J12 | `/ask` — **G7, live, first time ever** | **PASS.** See below |

## J12 / G7 — the live pipeline, first execution

Question: *"What does it mean that the Word became flesh?"*

Visible pipeline stages, in order: `Searching the commentaries` → `Found 6 voices across 3
traditions` → `Refining the answer (attempt 2)…` → `Verifying every quote is word-for-word`. The
"attempt 2" is the compose→verify retry loop CLAUDE.md documents — observed live, not inferred from
code.

Answer returned three voices, every one quoted and attributed, no interpretation in the product's
own voice:

- **Albert Barnes**, *Barnes' Notes on the New Testament* — Presbyterian
- **Adam Clarke**, *Adam Clarke's Commentary* — Methodist
- **Augustine of Hippo**, *Tractates on John 18* — Patristic

Grounded passage link: John 1:14. All three sources are on the clean side of H4/H5's fix — Barnes
crosswire (not the 21,036 biblehub rows this session quarantined from serving), Augustine newadvent
(not the historicalchristian.faith rows ADR-044 measured and left open). No console errors, no
failed network requests observed during the run.

**This is the first `/ask` answer this product has served against a real deployment with a real
password gate and real user auth**, per `MASTER.md`'s own framing of A7. G7 — the live probe leg
that every regression-gate run before this either skipped or ran DB-only — has now actually fired.

## Cross-cutting checks

| | Result |
|---|---|
| X1 no uncaught console error | **PASS** across `/home`, `/read/jhn/1`, `/ask`, `/library`, `/library/sermons`, `/library/passages`, `/library/word-study` |
| X2 390px mobile — no overflow/overlap | **PASS.** `scrollWidth === clientWidth` on every page checked. Initial read on `/read/jhn/1` looked like the fixed bottom nav clipped verse 9 — re-checked directly: `main`'s scroll container carries `pb-[calc(3.75rem+env(safe-area-inset-bottom))]` (60px, more than the 52px nav height), `scrollTop` was 0 at capture time, and the apparent clipping was ordinary transient occlusion of not-yet-scrolled content under a `position: fixed` bar — the same thing every bottom-tab-bar app does. Scrolling 500px confirmed verse 9 clears cleanly and the sticky header stays pinned. **Not a defect** — recorded because I almost reported it as one before verifying the scroll mechanics |

## J3 — FILED AS A DEFECT

**`/read/john/1` (the full book name) does not resolve; `/read/jhn/1` (the three-letter slug)
does.** `ref-parse.ts:173` returns `Unknown book: "john"` and the reader shows that string verbatim
with no suggestion and no link back to a working URL.

`web/src/bible/aliases.ts:56` already declares `jhn: ['john', 'jn', 'joh']` as recognized aliases —
so the alias table KNOWS "john" means John, and the reader's URL resolver does not consult it. Every
sidebar link, every internal link, and the passage-search "Open in reader" button all use the
three-letter slug, so this is unreachable through the app's own UI — it only bites a URL typed or
pasted by hand, or a bookmark from outside the app, or (materially) a search-engine or LLM-generated
link, since "the Gospel of John chapter 1" is the natural-language phrasing and `/read/john/1` is
the natural-language URL.

**Severity: LOW-MEDIUM.** Not reachable via the shipped UI (no regression risk to anything A1-A6
touched), but it is the exact kind of external entry point the deep-audit's own instruction calls
out: *"did this change create a new entrance? diff-scoped reviews miss these by construction."* A7
is not diff-scoped — it is the first walk of the live product's whole surface — and this is what it
found.

**Not fixed here.** A7 is a walk, not a gate; UI defects found on a walk are filed, not
patched mid-walk, so the fix gets its own review rather than riding in on an evidence commit.
Recommended fix: `ref-parse.ts`'s book resolver should run the raw input through the same
alias-normalization `aliases.ts` already does for the canonical form, before returning "unknown" —
one function, already exists, not consulted at this call site.
