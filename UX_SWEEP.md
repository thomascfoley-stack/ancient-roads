# UX_SWEEP.md — findings, overnight run on fix/ux-overnight-sweep

Format: ID · lane · severity (P0 broken / P1 user-angry / P2 friction / P3 cosmetic) · narrative · repro · expected vs actual.

---

## 🔴 P0 — Claude-11 — sign-up/sign-in do not hydrate, and the form put the password in the URL

Found while trying to browser-verify K-4/K-5. **Not from this branch** — reproduced with
`auth-forms.tsx` reverted to `dec9484`, and in a local **production** build, not just dev.

The `<Suspense>` boundary wrapping `AuthForm` never hydrates: on `/auth/sign-up`, 181 of the page's
234 nodes hydrate (`main`, `nav`, `body`, links, shell buttons) while **the form and its inputs do
not**. So `onSubmit` is never attached, the browser performs its default submit — and because the
form carried no `method`, that default is a **GET**. The first attempt of the night produced:

    /auth/sign-up?name=UX+Test+K45&email=uxtest%2Bk45a%40example.com&password=a-long-enough-password-2026

Password in the address bar, browser history, server access log, and the next request's `Referer`.
No account created. Controls, same browser and pane, back-to-back: `/read/jhn/3` hydrates, the
`/gate` form hydrates, `/auth/sign-in` does not.

**Fixed here: only the floor.** `method="post"` (red-proofed, `auth-form-method-floor.test.tsx`);
re-verified in a rebuilt production build that an un-hydrated submit now leaves the URL clean. That
removes the credential exposure for any cause of JS not running. **It does not make sign-up work.**

**The hydration failure is untouched and is the real bug**, and it needs confirming against the
DEPLOYED site — I could not reach it (behind `SITE_PASSWORD`). One page load and one line settles it:
`!!Object.keys(document.querySelector('form')).find(k=>k.startsWith('__react'))` — `false` means it
reproduces, and sign-up is broken in production. Full evidence, controls and caveats:
`docs/evidence/ux-remediation-2026-08-24/auth-form-no-hydration.md`.

---

## ⚠ READ FIRST — the findings record has a material error rate, mine most of all

Four items in the ratified plan have now failed verification **at build time, by the person who
filed them**, and the pattern is consistent enough to act on:

| Item | Filed as | Actually |
|---|---|---|
| **L-5** (DeepSeek-F12) | `/desk` empty state has no CTA | Both CTAs already render. Retracted at ratification (owner re-verified personally) |
| **Claude-1 / K-2** | P1, "strips inline scripture references" — content corruption | P2. The quotation survives; the *citation* is lost. Severity was overstated on a misread example |
| **Claude-4 / L-9** | progress reads 100% instantly | Its stated root cause was fixed on 2026-08-02 and has been **live for three weeks** |
| **Claude-5 / L-10** | word-study rows look clickable, aren't | Rows are working accordions; chips are already links. Proposed fix would break a documented design |

**Three of those four are mine.** The common factor is not carelessness about *whether* something
looked wrong — it is that each was filed from a quick observation on production without isolating
the mechanism, and the plan then inherited my explanation as if it were the finding. A wrong
explanation is more expensive than a wrong observation, because it survives review: two of the four
were endorsed by a second reviewer before anyone tried to build them.

**What this means for whoever works this plan next.** Treat every un-built item as *needs
re-observation*, not as *ready*. Specifically, before writing code for a finding, check that its
stated root cause is still true of the current tree — `git log -S` on the line it blames takes
seconds and would have caught L-9 outright. And when an item's exit test would pass on unfixed code
(L-5) or would change behaviour the code deliberately chose (L-10), that is the signal to stop and
re-observe rather than to build.

The four P1 fixes that DID land tonight were all confirmed by execution first — a red-proof, a live
browser run, or a query — which is the difference and the reason to keep insisting on it.

---

## MK-13 — 🔴 P1 — no privacy policy or terms linked on the landing page

**Narrative:** A first-time visitor scrolls the whole landing page looking for what happens to the
email they're about to hand over. There is no privacy policy, no terms link, anywhere — not in the
footer, not near the waitlist form.
**Repro:** Load http://localhost:3055/ (or prod), read the full page text / footer.
**Expected:** A linked privacy policy near the waitlist form or in the footer, per standard practice
for any product collecting emails + running analytics (PostHog is wired in per docs/ENVIRONMENT.md).
**Actual:** Footer text confirmed (get_page_text dump, 2026-08-23 tonight): "PRODUCT / HOME / FEATURES
/ WHY / MORE / ABOUT / LOG IN / © 2026 ANCIENT PATHS / CRAFTED WITH REVERENCE" — no privacy/terms link
anywhere in the rendered text. This matches the ledger's own pre-registered MK-13 prediction exactly.
**Confidence:** single-agent observation, not yet independently reproduced (P1 requires 2nd-agent
confirmation before it counts per the ledger's own rule — flagging for morning re-check, this is
real enough content-wise that I'm logging it now rather than losing it).

## LB-title-encoding — 🔴 P3 — double-encoded HTML entity in a work title

**Narrative:** A user browsing Historians sees a book title rendered with a literal `&amp;` instead of
an ampersand — reads as visibly broken, on every screen that shows this work's title (library list,
title tooltip).
**Repro:** Load `/library/historians` (signed-in, prod), find "Rutherford, Samuel" in the list; or
inspect the DOM directly: `[...document.querySelectorAll('main *')].filter(e => e.children.length===0
&& e.textContent.includes('Tryal'))`.
**Expected:** Title renders as `Tryal & Triumph of Faith: or An Exposition of the History of Christ's
dispossessing of the daughter of the woman of Canaan.`
**Actual:** Confirmed via `outerHTML`/`textContent` on the live DOM (2026-08-24 tonight, prod,
signed-in): the node's actual text content is the literal string `Tryal &amp; Triumph of Faith`, not a
decoded ampersand — both in the visible link text and in its `title=` attribute. The stored title
itself contains an HTML-escaped `&amp;` that the UI renders as plain text without decoding. Likely an
ingestion-time double-escape on this one work's (`rutherford-tryal` or similar slug, Samuel Rutherford)
metadata — worth a grep of `sources.title` for other `&amp;`/`&lt;`/`&gt;` occurrences since this may
not be isolated to one row.
**Confidence:** single-agent, DOM-verified (not a copy/paste artifact — confirmed via `outerHTML`).

## SM-scripture-refs — 🔴 P2 — no scripture references are clickable inside sermon body text

**Narrative:** A user reading a Spurgeon sermon that quotes or alludes to a Bible verse expects to be
able to tap the reference and land on that verse in the reader (this is the natural expectation set by
the rest of the app's verse-first design). There is nothing to tap — sermon prose renders as plain
text with zero interactive elements.
**Repro:** Load `/work/spurgeon-sermons01` (Volume 01: 1855, "Sermon 1: The Immutability of God"),
signed-in, prod. Inspect the DOM: `document.querySelector('main').querySelectorAll('a').length`.
**Expected:** Scripture references inside the sermon text (e.g. the sermon's own theme verse, Malachi
3:6, quoted in the opening lines) are clickable and route to `/read/[book]/[chapter]#[verse]`.
**Actual:** Confirmed via JS after the *entire* 1855 volume (50 full sermons, 1,396,180 characters,
2,041,057px of scroll height) was mounted in the DOM: `main.querySelectorAll('a').length === 0`.
Zero anchor tags anywhere in the reading surface. This is despite the underlying data model already
carrying structured verse metadata per sermon — `GET /api/work/spurgeon-sermons01/sections` returns
`"verseStart":39003006,"verseEnd":39003006` (Malachi 3:6) on the very sermon whose text quotes that
verse — so the reference-to-verse mapping exists server-side but is not surfaced as a link in the
reader UI at all.
**Confidence:** single-agent, DOM- and API-verified (not a sampling gap — checked the fully-mounted,
un-virtualized volume, and cross-checked the API payload for the metadata that would back a link).

## WK-content-empty-citations — 🔴 P2 — empty parenthetical scripture citations in stored source text

**Narrative:** A reader hits a scripture quotation mid-sentence with a citation that trails off into
nothing — `says the Lord ( ).` — which reads as visibly broken and undermines the concordance's core
promise of precise attribution.
**Repro:** Load `/work/kempis-imitation` (The Imitation of Christ), Chapter 1, signed-in, prod. Inspect
the paragraph containing "walks not in darkness": `[...document.querySelectorAll('main
p')].find(p=>p.textContent.includes('walks not in darkness')).innerHTML`.
**Expected:** `says the Lord (John 8:12).` — or whatever the correct reference is — filled in.
**Actual:** Confirmed via `innerHTML` (2026-08-24 tonight, prod, signed-in) — the literal stored text
reads `“HE WHO follows Me, walks not in darkness,” says the Lord ( ). By these words of Christ...` The
quote is John 8:12; the reference is simply missing from the ingested `body` text, not a rendering bug.
This generalizes an earlier finding from tonight's AS-01/AS-04 checks, which found the same empty-paren
pattern (`"compare with )"`, `"( e.g. , )"`) inside AI-answer-quoted excerpts — this confirms the defect
lives in at least one work's stored source text directly, independent of the Ask pipeline, meaning it's
an ingestion/source-formatting issue (original texts likely used footnote/superscript verse markers
that were stripped without capturing the reference target) rather than something introduced downstream.
Found on the very first devotional work sampled tonight, not after searching for it — worth a
corpus-wide grep for empty-parens patterns (`\(\s*\)`) across `sections.body`.
**Confidence:** single-agent, DOM-verified (`innerHTML`, not a text-extraction artifact).

## WK-progress-fake-100 — 🔴 P2 — reading progress reports 100% on first page load for unpaginated works

**Narrative:** A user opens a 63-sermon-volume book, glances at the first paragraph, and the library's
"Continue Reading" rail already claims they finished the whole thing — a progress indicator that lies
the moment it's used on this class of work.
**Repro:** Load `/work/spurgeon-sermons01` (Volume 01: 1855) signed-in on prod, read only the first few
lines, then check `/library`'s "Continue Reading" rail.
**Expected:** Progress reflects roughly how far the user actually scrolled/read (comparable to every
other work opened in the same session, which correctly showed 0%).
**Actual:** Confirmed 2026-08-24 tonight: after loading `/work/spurgeon-sermons01` and reading only the
opening of Sermon 1, `/library`'s Continue Reading rail shows **"Spurgeon's Sermons Volume 01: 1855 ·
100%."** Five other works opened in the same session (Schaff's Creeds, Calvin's Institutes, Kempis,
Watts, Adam Clarke) all correctly show 0%. Root cause is almost certainly the same one behind the
SM-scripture-refs finding above: this volume's 50 sermons (1,396,180 characters) all mount in the DOM
in a single unpaginated fetch, so if progress is computed from "sections fetched" rather than "sections
actually scrolled past," any work ingested this way will read 100% instantly regardless of what the
user actually read. Worth checking whether the same computation backs reading-PLAN completion tracking.
**Confidence:** single-agent, directly observed on the rendered library page (not inferred from code).

## NV-back-exits-reader — 🔴 P1 — Back from an open verse panel exits the reader entirely

**Narrative:** A reader taps a verse to see commentary, decides they're done, and reflexively hits
Back — a completely ordinary "dismiss this overlay" gesture, doubly so on mobile where Back is often a
physical button or edge-swipe. Instead of closing the panel, it throws them off the page they were
reading and back to wherever they came from.
**Repro:** Signed-in, prod: navigate to `/read/john/3`, click verse 3's superscript to open the verse
panel (confirm open via DOM: `document.body.textContent.includes('Commentaries')`), then trigger
browser Back.
**Expected:** The panel closes; the user stays on John 3.
**Actual:** Confirmed 2026-08-24 tonight via `window.location`/document title before and after: Back
navigated all the way to the previous page in history (in this test, "My Studies"), skipping the reader
entirely. Root cause (read from source, `web/src/app/read/[book]/[chapter]/page.tsx:277-281`): the
panel's open/closed state is a plain client `useState`, with no `history.pushState`/route change when
it opens — so there is no history entry for Back to consume, and it falls through to whatever preceded
the reader visit. This was a pre-registered "likely gap" from tonight's NV-00 back-map draft, confirmed
live rather than left as a guess.
**Confidence:** single-agent, confirmed live (not inferred from code alone) via URL/title observation
across the Back action; root-cause line citation is from source reading, not executed/stepped-through.

## WS-panel-dead-click — 🔴 P2 — the verse panel's own "Word study" tab looks clickable but isn't

**Narrative:** A user taps a verse number (the documented, banner-advertised way into word study),
switches to the panel's "Word study" tab, sees a list of Greek words each styled like a row with a
Strong's-number badge — and taps one expecting to open that word's full entry. Nothing happens except
the panel closing. The only way to actually reach a word's entry is to close the panel and instead
double-tap the word directly in the passage text — a completely different, undocumented gesture.
**Repro:** Signed-in or signed-out, prod: `/read/john/3`, tap verse 3, switch to "Word study" tab, tap
any word row (e.g. Ἰησοῦς/G2424). Compare with: close the panel, double-tap "Jesus" in the verse text.
**Expected:** Either the panel row navigates to `/word/[strongs]`, or the panel doesn't present the rows
as tappable in the first place.
**Actual:** Confirmed 2026-08-24 tonight: tapping a Word-study-tab row closes the panel (click falls
through to the panel's own backdrop-dismiss handler) with no navigation. Double-tapping the same word
directly in the passage text correctly opens `/word/2424` (Ἰησοῦς, full definition/concordance/lexicon).
Two entry points to the same feature, one dead, one live, with no hint in the dead one pointing at the
live one.
**Confidence:** single-agent, directly observed (both the dead click and the working double-tap path).

## ST-dead-controls — 🔴 P2 — Text Size and Column Width settings do nothing

**Narrative:** A user who wants larger text for comfortable reading finds the control right there on
Settings, labeled and interactive-looking — and nothing happens, with no error, no feedback, and (per
the page's own copy) no explanation of why. Column Width has the identical problem.
**Repro:** Signed-in, prod: `/settings`, click "Larger text" (or "Smaller text") 3×, observe the
"Medium" label; click "Narrower column", observe the "Widest" label; then check
`Object.keys(localStorage)` and the computed `font-size` on `/read/john/3`'s `<main>`.
**Expected:** The label advances (e.g. Medium → Large), the setting persists (matching Theme and
Default Translation, which both work correctly on the same page), and the reader's actual text size or
column width changes.
**Actual:** Confirmed 2026-08-24 tonight: label never changes after repeated clicks on either control;
`localStorage` after the clicks contains only `translation`, `reader-theme`, `bible-position:v1`, and
the PostHog id — no text-size or column-width key exists at all; computed `font-size` on the reader's
`<main>` stayed `16px` before and after. Theme and Default Translation, immediately adjacent on the
same settings page, both work and persist correctly — making the two dead controls easy to miss as
broken (nothing LOOKS different about them).
**Confidence:** single-agent, verified three independent ways (label, storage, computed style) to rule
out a display-only sync issue.

## PL-title-duplication — 🔴 P3 — reading-plan tab title says the site name twice

**Narrative:** Cosmetic, but visible in every browser tab and history entry for the page.
**Repro:** Signed-in, prod: open any reading plan detail, e.g. `/plans/[id]`, check the document title.
**Expected:** "The Gospels in 8 weeks · Ancient Paths" or similar, one site-name suffix.
**Actual:** Confirmed 2026-08-24 tonight: title reads **"Reading plan · Ancient Paths · Ancient
Paths"** — the site suffix is duplicated.
**Confidence:** single-agent, directly observed.


## WK-content-empty-citations — ROOT CAUSE FOUND, upgrading to P1 (data-quality, not cosmetic)

**Supersedes nothing above, adds the fix-ready diagnosis.** Root cause confirmed by a dedicated
investigation tonight, not just observed symptoms:

**`src/ingest/adapter-ccel.ts:59`**, inside `thmlText()`:
```js
.replace(/<scripRef\b[^>]*>[\s\S]*?<\/scripRef>/gi, ' ')
```
This regex deletes an entire `<scripRef>` element **including its inner display text** — the actual
verse reference a human reader typed — leaving only the surrounding hand-typed punctuation (`(`, `)`,
`;`, `,`, `e.g.`) behind. The code comment justifying this ("their display text is debris... already
consumed by unitAnchor") holds for standalone footnote-style `scripRef`s, but not for inline ones
embedded mid-sentence in prose — which is the common case in these public-domain commentaries.

**Confirmed against the actual live CCEL source, not inferred:** fetched `ccel.org/ccel/kempis/
imitation.xml` and `ccel.org/ccel/jamieson/jfb.xml` — the exact URLs `ingest/sources.config.json`
points the ccel adapter at. Kempis' source line reads `says the Lord (<scripRef ...>John 8:12</scripRef
>). By these words...` — which reproduces, byte-for-byte, the `says the Lord ( ). By these words...`
found live in the DOM earlier tonight. JFB's `(<scripRef>De 17:18</scripRef>; <scripRef>27:3</scripRef
>...)` pattern matches the `"( , )"` / `"( ; ; )"` shapes seen in the Passion-narrative excerpt.

**Ingestion-time, not render-time:** no render-path code touches citation punctuation; three sibling
adapters (`sword-genbook.ts`, `sword-zverse.ts`, `sword-ld.ts`) handle the identical `scripRef` element
correctly (strip the tag, keep the inner text) — only the CCEL adapter has this bug.

**Blast radius:** confirmed on Kempis, and by source-code inspection affects every CCEL-sourced work
with inline (non-footnote) `scripRef`s — Calvin's Institutes and Schaff's Creeds are named as likely
affected in `ingest/sources.config.json`'s ccel-adapter entries, not individually re-verified tonight.
Full sizing needs a DB grep for the `(\s*)`/`(\s*[,;]\s*)`-style empty-paren pattern across
`sections.body` — not done (read-only investigation, no DB write access used).

**Why this is P1, not cosmetic:** this isn't just a broken paren — it's the citation itself silently
vanishing from quoted historical sources in a *concordance product whose entire guarantee is precise
attribution* (see CLAUDE.md's product guarantee). A user cannot verify a quote against a reference that
was never rendered. Re-ingesting affected CCEL works with the one-line regex fix (keep the inner text,
drop only the tags) looks cheap relative to the blast radius.

## DO-anchor-missing — 🔴 P2 — Daily Office's "Read {verse} in full" link doesn't anchor to that verse

**Narrative:** The Daily Office (`/home`) names a specific verse in its own CTA copy — "Read
Ephesians 3:17 in full" — after quoting and discussing that exact verse. A reader clicks expecting
to land on Ephesians 3:17. Instead they land at the top of the chapter and have to find verse 17
themselves, in this case among 21 verses, but Psalm chapters or Matthew 26 could make the same gap
much worse.
**Repro:** Signed-in, prod: load `/home`, note today's Spurgeon lead reference (e.g. "Ephesians
3:17"), click "Read {ref} in full", check `location.href`.
**Expected:** Lands on the chapter scrolled/anchored to the specific verse, e.g.
`/read/eph/3#v17` — the app already has this exact mechanism (`verseHref()` in
`web/src/lib/verse-link.ts`, returning `/read/{slug}/{chapter}#v{verse}`) and uses it correctly
elsewhere (confirmed live tonight: the Omnibox's reference-jump feature routes through it and
correctly lands on, e.g., `/read/jhn/3#v16` with the target verse scrolled to the top of the
viewport).
**Actual:** Confirmed via `location.href` after the click: plain `/read/eph/3`, no `#v17` hash.
The link is built in `web/src/components/today-view.tsx:307` as
`href={`/read/${card.bookSlug}/${card.chapter}`}` — chapter-level only, verse number discarded even
though `card.lead` (the same object the CTA's own label text pulls the verse number from) is right
there in scope. A one-line fix (append `#v${card.lead.verseStart}` or reuse `verseHref`) would close
the gap the same way the Omnibox already closes it.
**Confidence:** single-agent, confirmed live via direct URL/hash observation and cross-checked
against source for both the broken call site and the working sibling mechanism.

## PostHog-CSP-blocked — 🔴 P1 (upgraded from P2 on follow-up) — production analytics totally dark app-wide (CSP violation)

**Narrative:** Every page load in production throws console errors for PostHog's own scripts,
blocked by the site's Content-Security-Policy. Nothing is user-visible — no broken UI, no crash —
but this means the product likely has near-zero real analytics/exception-autocapture coverage in
production right now, silently, which affects every other data-driven decision (including this
sweep's own kind of QA work, if anyone were relying on PostHog session replay or error tracking to
catch what manual sweeps miss).
**Repro:** Signed-in or signed-out, prod: load any route, check console errors (e.g.
`read_console_messages` with `onlyErrors: true`, or open DevTools).
**Expected:** PostHog's exception-autocapture, config, and surveys scripts load and initialize
without CSP violations (or, if intentionally disabled, are not attempted at all rather than
attempted-and-blocked every page load).
**Actual:** Confirmed 2026-08-23 tonight, repeated on multiple page loads (`/home` at both desktop
and mobile viewport): 5 distinct PostHog script URLs blocked per page load —
`us-assets.i.posthog.com/static/{version}/exception-autocapture.js`, `.../array/{key}/config.js`,
`.../static/exception-autocapture.js?v=...`, `.../static/{version}/surveys.js`,
`.../static/surveys.js?v=...` — each reporting: `Loading the script '...' violates the following
Content Security Policy directive: "script-src 'self' 'unsafe-inline'"`. `script-src` has no
allowance for `us-assets.i.posthog.com` (and no separate `script-src-elem`, so `script-src` is the
fallback per the browser's own error text). This repeats identically on every navigation, not a
one-time init issue.
**Confidence:** single-agent, directly observed via `read_console_messages`, reproduced across two
separate page loads.

**Follow-up done, ambiguity resolved — this IS a total blackout, upgrading to P1.** Checked whether
event-capture still works via the same-origin `/ingest` proxy docs/ENVIRONMENT.md describes (the design
that's supposed to make PostHog CSP-safe): it does not. On a fresh `/home` load (signed-in, prod):
`read_network_requests` shows **zero** requests to `/ingest` or any `posthog`-hostname URL, across 40
total requests captured (every app API call — `/api/auth/get-session`, `/api/plans`, `/api/research`,
`/api/studies` — fires normally; nothing PostHog-related fires at all). `window.posthog` is `undefined`
in the page's JS context. `web/src/instrumentation-client.ts:45,102` confirms `posthog-js` is bundled
via `import` (not loaded from the blocked CDN) and `posthog.init(key, {...})` is called with the real
production key (the blocked `config.js` URL contains it: `phc_CXb2YmUC6AYQ5VzkpgrHc6vbC4vfdohnPE6MrC9hw
rqG`) — so `init()` is reached and attempts its remote-config fetch, that fetch is what's CSP-blocked,
and whatever happens next inside `init()` when that fetch fails means the SDK never proceeds to send
even a single event, not through `/ingest`, not anywhere. **Practical effect: production PostHog
analytics have been capturing nothing** — not DAU, not the `search_outcomes`/`ask_outcomes` telemetry
MASTER.md describes at length, not error autocapture — for however long this CSP gap has existed
(not dated tonight). `web/next.config.ts`'s CSP header needs `us-assets.i.posthog.com` added to
`script-src` (or `script-src-elem`) to restore this. Given how much of this repo's own programme sheet
leans on PostHog data being real, this is worth checking first thing, not filed-and-forgotten.

---

## Claude-10 — 🔴 **P1 — bug #110's account-existence fix is DEAD CODE; the oracle is open**

*(Found 2026-08-24 while implementing K-4/K-5. Not in the reconciled record — this is a NEW finding,
and it is the root cause of both K-4 and K-5 rather than a separate defect.)*

**Narrative:** Someone probing for registered addresses types an email into sign-up. The app answers,
in these words: **"User already exists. Use another email."** That is a clean account-existence
oracle — the exact class `auth-forms.tsx` carries a 12-line comment claiming to have narrowed, and
the class SEC-1 exists to close.

**Mechanism (proven by execution, not by reading):** every `authClient.*` call **throws** on 4xx; it
resolves `{ data, error }` only on success and never populates `error`. So this shape —

    const { error: err } = await authClient.signUp.email({...});
    if (err) throw new Error(ACCOUNT_EXISTENCE_CODES.has(err.code) ? 'That account could not be created.' : ...);

— is unreachable. The rejection skips it entirely and lands in `catch (e) { setError(e.message) }`,
which puts the **raw auth-server sentence** on screen. Verified against the installed
`@neondatabase/auth@0.5.0-beta` by driving the real client with a stubbed 422.

**Why it was invisible:** `@neondatabase/auth` is a Supabase-shaped shim over better-auth. Its
`BETTER_AUTH_ERROR_MAP` *does* translate the bare `USER_ALREADY_EXISTS` into a safe message — so a
reviewer checking that map concludes it is handled. But better-auth's sign-up route actually throws
`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`, which is **not in the map**, so it falls through to the
branch that forwards `betterError.message` verbatim. The repo's own comment names that longer code —
it was right about the wire code and wrong about who consumes it.

**Blast radius — the same dead pattern, three more places in the one file:**
`signIn.email` (the "do not match an account" generic never fired — readers saw the shim's raw
`Invalid email or password`, which is harmlessly generic *by luck*), `resetPassword` (an expired link
read as `Invalid or expired session token`), and `signIn.social`.

**Expected vs actual:** expected one generic sentence per surface, chosen by us. Actual: whatever the
auth vendor happened to write, including an existence oracle.

**Status: FIXED in this branch** as part of K-4/K-5 (they share this root cause — the missing
verification UI and the false "wrong password" are both this bug). Red-proofed at 5/6 legs before
the fix; `web/test/auth-verification-feedback.test.tsx`. Curation is now path-aware and applied in
the catch, where the rejection actually lands.

**Needs independent verification (I am the finder AND the fixer — this cannot be self-certified):**
the sign-up duplicate-address path against a **real** Neon Auth server. My proof that the branch is
unreachable is by execution; my claim about *which sentence* the live server sends is inferred from
better-auth's source and the repo's own prior verification note. A verifier should sign up twice with
one address on preview/prod and read the screen.

---

## Claude-1 — ✏️ **SEVERITY CORRECTED: P1 → P2.** My own finding, wrong in its evidence

*(Corrected 2026-08-24 while implementing K-2. Recording the wrong half because it is the
instructive half.)*

**What I filed:** "CCEL ingestion strips inline scripture references" at **P1**, described as content
corruption, citing a Kempis sample as confirmation.

**What is actually true.** In Kempis the quotation sits **outside** the `<scripRef>` element and
survives intact — only the citation is deleted, leaving `"…I go to prepare a place for you" ( ).`
So no scripture text was ever being deleted, and my "content corruption" framing was wrong. Verified
against the live dev corpus, not re-read from my own notes.

**What survives, and why it is still worth fixing.** Measured over the 876 cached ThML works
(135,464 `<scripRef>` elements sampled across 250 files):
- **21%** sit immediately inside an open parenthesis → deletion leaves visible `( )` debris.
- **78%** sit in running prose → deletion leaves a sentence missing its object: *"He is mentioned
  in ."*, *"See ."*

That is lost citations and broken sentences — real, reader-visible, and worth fixing in a product
whose promise is precise attribution — but **not** the corpus corruption I claimed. **P2.**

**PRODUCTION sizing — run 2026-08-24 on owner go, read-only.** 27 CCEL works, **all published** ·
40,463 sections · **1,937 sections (4.8%) carrying `( )` debris, every one of them reader-visible.**
Dev held the same corpus with all 27 works *staged*, so the damage was invisible there and visible
here — which is exactly why the dev number was filed as indicative only. Evidence + per-work table:
`docs/evidence/ux-remediation-2026-08-24/k2-prod-sizing.md`; re-runnable via
`node scripts/k2-ccel-sizing.mjs`.

**The plan's inherited claims are now settled, and two were wrong.** **Calvin's Institutes is NOT
affected** — it does not appear at all. **"Schaff's Creeds" is not the affected Schaff work**; it is
Schaff's *History of the Christian Church* (`schaff-hcc1`–`hcc8` + `schaff-person`), 568 sections
across nine works. And the two worst-hit works were never named by anyone: `vanbraght-mirror` (557)
and `rutherford-triumph` (466), together 53% of all damage. 19 works affected in total.

**Status: adapter FIXED in this branch** (`src/ingest/adapter-ccel.ts`, 4 test legs, red-proofed).
**Stored rows are NOT repaired** — the adapter is upstream of the corpus, so existing text stays
damaged until a re-ingest, which is an owner-approved step. That remains the most important sentence
in K-2 and it is unchanged by this correction.

---

## Claude-4 (L-9) — ⛔ **HELD: stated root cause already fixed and live for three weeks**

**What I filed:** reading progress reads 100% immediately on unpaginated works.

**Why it cannot be what the plan says.** The plan's fix — "compute from sections-read, not
sections-fetched" — is precisely what commit `79494d4` did on **2026-08-02**. The denominator was
`work.toc.length`, which meant "however many rows survived the 5,000 cap", so a reader 40% through
john-gill's 28,843 sections saw a full bar. It is now `toc[last].lastOrdinal`, the exact section
count (`web/src/app/work/[slug]/page.tsx:122`). That commit is an **ancestor of the live `7747f10`**,
so production has been serving the corrected denominator for three weeks — including on the night I
filed this.

**So one of two things is true**, and I cannot tell which without a signed-in session: the symptom
has a *different* cause, or my observation was wrong. Either way, building the planned fix would
edit a line that already reads the way the ticket asks — an unearned green by construction, the same
trap that retired L-5.

**To re-observe (needs auth, which local dev does not have):** sign in on prod, open a long
unpaginated work, and record the work slug plus the percentage shown at first paint and after
scrolling. If it does not reproduce, retire the finding.

**My scope-gap note about reading plans is NOT retired by this** — it was a separate question
(*does plan-day completion share this computation?*) and it does not: plan days are their own
write path. Worth one explicit check by whoever has a session, but there is no shared code to fix.

---

## Claude-5 (L-10) — ⛔ **HELD: did not reproduce, and the planned fix would break a deliberate design**

**What I filed:** the verse panel's Word-study rows look clickable but do nothing.

**Driven live tonight** (dev, signed out, John 3:16 → Word study tab): 25 rows render. Every row is a
working accordion. Every Strong's chip is already a link to `/word/G####` (`/word/G1063`, `/word/G25`,
`/word/G3588`, `/word/G2316` all present in the DOM). Clicking the first row — Οὕτως, which has no
Strong's number and therefore no chip — expands to **"ADVERB — No dictionary entry linked (lemma
οὕτω(ς))"**. That is an honest empty state, not a dead control.

**The proposed fix is actively wrong.** Its exit test is "row click navigates", which would replace
the accordion with navigation. `study-panel.tsx:568-570` explains why the current split exists: the
chip is a link and a **sibling** of the toggle, never nested inside it, because *"a link in a button
is invalid and one tap cannot honestly do two things."* Implementing L-10 as written would undo a
considered accessibility decision in order to satisfy a finding that does not reproduce.

**If it is real it is a different bug** — most plausibly the lexicon assets failing to load on prod
(CH-10's corpus-CDN class), which would present as rows that expand to nothing. That has a different
fix. Re-observe naming the verse, the row, and what was expected.

