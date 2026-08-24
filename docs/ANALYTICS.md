# ANALYTICS — what is measured, where to look, and what is deliberately not measured

## THE STANDING DECISION (2026-08-24): own the nouns, rent the mouse movements

Stated once, here, so nobody rediscovers it in a panic later.

**OWNED — in our Postgres, forever, vendor-free.** Who signed up and which campaign brought them
(`waitlist.attribution`), what they asked (`ask_outcomes`), what they searched (`search_outcomes`),
what matched (`match_outcome`), and **who was active on which day** (`user_active_day`). Every
retention number the owner asked for — DAU, WAU/MAU, 7-day churn, resurrection — computes from
these with no vendor involved. `scripts/growth-report.mts` prints the lot.

**RENTED — in PostHog, and its history is DISPOSABLE.** Pageview counts, anonymous pre-signup
browsing, session paths, device and geography. If PostHog vanished tomorrow we would lose
historical curiosity and not one fact needed to run the product. **That is the deal. It is not a
regret to be fixed later.**

**Why not put pageviews in Postgres too**, since "own everything" sounds stricter: this database
also serves the corpus — the same Neon compute holds the vector index over ~295k sections and
answers `/ask` at p50 10.5s. A pageview-rate append stream evicts that working set, trading
measured product latency (under a quality gate) for dashboards this document calls non-load-bearing.
It also pins the compute out of autosuspend from roughly ten users, and would require a public
unauthenticated write endpoint whose limiter fails open by design. `user_active_day` gets the same
answers at one row per user per day — about 13× cheaper — with no public write surface at all.

**Revisit only when ALL THREE hold:** sustained >5k DAU, a named question this split provably
cannot answer, and analytics moved to its OWN Neon project — never the database serving the corpus.



Built 2026-08-24 to the owner's directive: **DAU**, **churn (no visit in 7 days)**, and **UTM
attribution** for newsletter and social campaigns. This is the reference; the build narrative is
WORKLOG 2026-08-24, and the privacy posture is `web/src/instrumentation-client.ts`'s own header.

## Where to look

**First, our own database** — this answers the questions that matter and needs no vendor:

```bash
DATABASE_URL=<owner-url> npx tsx scripts/growth-report.mts --days 30
DATABASE_URL=<owner-url> npx tsx scripts/waitlist-export.mts --campaign jan-newsletter > list.csv
```

`growth-report` prints signups, campaign breakdown, DAU/WAU/MAU, churn, ask and search volume, and
the searches that found NOTHING — the last of which is the most useful list in the report, because
every row is either a corpus gap or a retrieval bug. `waitlist-export` writes the list as CSV,
deduplicated to first touch and with suppressed addresses excluded at source (there is deliberately
no flag to include them).

**Then PostHog** — project **561364**, dashboard **Ancient Paths — Growth & Retention** (`2025202`)
— for the rented half: pageviews and anonymous browsing.

| Tile | Answers |
|---|---|
| DAU — daily active users | unique users per day |
| WAU / MAU | weekly + monthly actives; the ratio is a stickiness proxy |
| Lifecycle | new / returning / resurrecting / **dormant** — dormant *is* churn, day by day |
| Retention | do first-time visitors come back, by weekly cohort |
| Traffic by campaign source | visits broken down by `utm_source` |
| Waitlist signups by campaign | which campaign **converted**, not just which sent traffic |
| Signup funnel | pageview → waitlist submitted → waitlist succeeded |

Cohorts: **Churned — was active, no visit in 7 days** (`510882`) and **Active — visited in the
last 7 days** (`510883`).

> **Why the churn cohort has a positive leg.** "No visit in the last 7 days" on its own also
> matches every person who has never visited at all — the whole world, minus this week's traffic.
> Churn is *was active, then stopped*, so the cohort is `active within 90 days` **AND** `no
> $pageview in 7 days`. Change the 90 if the product's natural cadence turns out to be longer;
> do not remove it.

## Campaign links

Tag campaign URLs with standard UTM parameters and the breakdowns above populate themselves:

```
https://ancientpaths.app/?utm_source=newsletter&utm_medium=email&utm_campaign=launch
```

`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` are all read, as are the
click ids `mc_cid` (Mailchimp), `gclid`, `fbclid`, and the rest of posthog-js's list. posthog-js
sends these as top-level event properties automatically — nothing in product code passes them.

**The marketing tier is public** (`/`, `/about`, `/features`, `/why`, `/api/waitlist`), so campaign
attribution works today. The app itself is behind the SEC-1 site password, so app-side DAU counts
gate-holders only until that lifts.

## The events

Product code reaches PostHog through exactly one door: `web/src/lib/analytics.ts`, whose
`TrackEvent` union is **closed**, and every property on it is an enum or a boolean. There is no
`track(name: string, props: object)` — a free-form signature is how a question, an email or a
filename eventually becomes an analytics property, and a type is a mechanism where a review rule
is not.

`waitlist_form_submitted` · `waitlist_signup_succeeded` · `waitlist_signup_failed{reason}` ·
`auth_page_viewed{mode}` · `sign_up_*{method}` · `sign_in_*{method}` · `password_reset_requested` ·
`first_run_reached` · `question_asked{is_followup}` · `search_run{surface}` · `plan_started{scope}`
— plus `$pageview`, which is what DAU, churn and attribution are actually computed from.

## The four rules (owner directive, 2026-08-24)

Stated by the owner in their own words, and each one is enforced somewhere rather than promised:

| Rule | Where it holds |
|---|---|
| "if someone searches for ephesus I should be able to see that" | `search_outcomes` (migration 129) logs the query text of every search, owner-readable via `scripts/query-log.mts` |
| "when someone enters something in their journal that should be blank to me" | `prayers` is RLS-scoped per user and **no code path logs its body** — not the routes, not analytics, not PostHog |
| "if someone types a sermon out I shouldn't see that" | user documents never enter the ask log (`teach()` keeps `userVoices` out of `result.retrieval`, so `ask_outcomes` stores corpus references only), and no match event carries a title or a character of the text |
| "if they match sermon content to commentaries I should see those successes and failures and errors" | `match_outcome` on all three matching surfaces — anchor (`documents/[id]/voices`), semantic (`documents/[id]/related`), and draft (`draft-check`) — each logging hit / empty / pending / error |

`match_outcome` carries: `kind`, `outcome`, `voices`, an opaque `documentId`, timings, and for the
draft check the *length* of the paste. It never carries the document's title or text.
`web/test/match-outcome-telemetry.test.ts` pins both halves and red-proves them: seed a title into
the event and the privacy test goes red; delete a `logEvent` and the outcome tests go red.

**Why `empty` is logged separately from `error`.** A sermon that preaches a passage without
quoting it anchors nothing and returns zero voices with nothing broken (see
`related-voices.ts`'s header for the measured case). In a plain error rate that is invisible —
it looks exactly like a success. It is the failure most worth watching.

### Two honest limits

- **The owner role can read anything.** RLS stops the *application*; it does not stop someone with
  the owner connection string running SQL. Journal entries and sermon text sit in the database in
  plain text because search requires it. "Blank to me" is true of every log, every dashboard and
  every product surface — it is not disk encryption, and no code change can make it that.
- **`my_works` searches log their query text**, like every other search surface. That is a search
  (rule 1), but it is a search over a *private* library, so the text could be personal. Narrowing
  that one surface to counts-only is a one-line change if the owner wants it; it is left logging
  by default because rule 1 says searches are visible.

## What never leaves the browser

- **The reader's question.** `$current_url` rides every event, and the question lives in the query
  string (`/ask?q=…`, `/search?q=…`, `/gate?next=%2Fask%3Fq%3D…`). `sanitizeUrl` keeps the path and
  an **allowlist** of campaign parameters, and drops everything else — on every event.
  An allowlist fails safe: an unlisted parameter costs a breakdown, never a leak.
  Pinned by `web/test/analytics-url-sanitizer.test.ts`, which red-proves both halves.
- **Emails and any PII.** `identify()` is called with the opaque internal user id and nothing else;
  no `$set` of personal data. Pinned by `web/test/posthog-wiring.test.ts`.
- **Study titles and uploaded filenames.** `autocapture: false` (it ships `$el_text`), and the
  element properties are deleted in the sanitizer regardless.
- **The rendered screen.** `disable_session_recording: true`.

## Deliberately not measured

**Prayer-journal activity.** That feature's own rule is "NO STREAKS, NO COUNTS, NO
GAMIFICATION… prayer is not a habit metric" (`prayer-journal.tsx`). An event counting prayers is
that metric kept in a different system. Do not add one without revisiting that ruling.

## If it breaks

Nothing here is load-bearing for the product. Analytics fails soft everywhere by design — owner
ruling 2026-08-18, "if PostHog doesn't work, I don't care" — so a blocked SDK, a missing key or a
capture error must never surface to a reader. If you find a path where it can, that is a bug in
this layer, not a tuning question.
