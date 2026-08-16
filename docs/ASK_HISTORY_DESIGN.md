# RESEARCH HISTORY — architecture and design

**Status:** APPROVED IN PART, 2026-08-16 (owner, in session). §4.1 storage (`chats` +
`messages`) approved — "yes i like chats + messages we can fix later". The three §1 questions
answered: click-through opens the reader with a way back; history per-account in the database;
**every ask runs fresh, never cached** ("always a new, not cached, correct or incorrect").
§4.7 (the Show filter) added and ruled variant A. §8 S0 measurement still required before
build; no implementation exists.
**Lane:** C (client surfaces + the user-data layer). File-disjoint from A and B.
**Filed:** 2026-08-10 against `39cc32b`. Revised the same day after the owner added the
open-a-resource / back-button requirement and named the section **Research History**.
**Expands** `MASTER.md` UX-4, which captured this on 2026-08-02 and was deliberately left
undesigned. This design closes UX-4's three open questions and merges it with UX-1.

> Every fact below marked **MEASURED** was read out of the tree at `39cc32b`. Everything marked
> **UNKNOWN** is a hole this design refuses to fill by inference — each is listed in §8 with the
> measurement that would close it. The distinction is load-bearing: §3.2 is the difference
> between a two-day feature and a corpus-wide backfill, and nothing in the tree settles it.

---

## 1. The requirement

Three asks, which turn out to be one feature:

- **R1 — nothing is lost.** A question, and the answer as it was given, survive the session.
- **R2 — every surfaced item is openable.** Click a commentary or resource in an answer and land
  *in the full work, at the place that was quoted*, able to keep reading.
- **R3 — back returns to the whole list.** Coming back from that work returns to **all** the
  items that answer surfaced, not to an empty page.

**R3 is not a scroll-restoration problem, and R1 is its fix.** MEASURED: the entire result set
lives in `web/src/components/ask-client.tsx:174` — `useState<Turn[]>([])` — and there is no
`localStorage`, no persistence route, and no URL that identifies an ask. Clicking a result
navigates to a different route entirely (§2.3), so returning remounts a component whose only state
is an empty array. There is nothing to restore *to*. Giving a thread a durable identity and a URL
is what makes back work; it is the same work as R1, not an addition to it.

---

## 2. How it works today — measured

### 2.1 The ask pipeline

`POST /api/ask/stream` → `requireUser` → rate limit → `teach(question, { onEvent, lanes })` →
NDJSON stream of stage events, ending in `done`. The **verifier runs server-side inside `teach()`
before `done` is emitted** (`route.ts:33-38`, stated in the route's own comment). Nothing else
about the pipeline is on the request path.

The stream carries three separately-shaped things, and R2/R3 concern all three:

| Event / field | Contents | MEASURED at |
|---|---|---|
| `retrieved.sources` | **every** retrieved chunk — `sourceId`, author, sourceTitle, tradition, content, score | `teach.ts:147-158` |
| `done.result.retrieval` | the same full retrieval, on the result | `ask-client.tsx:22-26` |
| `done.result.response.blocks` | the **composed** answer — a subset, `COMPOSE_VOICES` selected by `selectVoices()` | `teach.ts:160` |
| `done.result.{song_verse,sermons,theology}` | register-lane chunks, kept in their own labelled sections, never blended into exegesis | `teach.ts:130-133` |

So "all the resources that were surfaced" is **retrieval + lane chunks**, which is strictly larger
than the voices the composer quoted. R3 means storing the full set, not the quoted subset.

`ask-outcome-log.ts` records only kind/ms/attempts/voices/traditions, and `observability.ts:5-7`
forbids it from ever carrying question text. So nothing anywhere retains what was asked.

### 2.2 The corpus has two stores, and `embeddings.source_id` has two namespaces

**This is the finding that decides the cost of R2.**

There are two parallel corpus models, written by different code, addressed differently:

| | Retrieval store | Shelf / reader store |
|---|---|---|
| Tables | `embeddings` | `sources` → `sections` → `section_anchors`, `section_embeddings` |
| Key | `source_id TEXT` (+ `source_type`, `chunk_index`) | `sections.id BIGINT`, `UNIQUE(source_id, ordinal)` |
| Read by | `/api/ask` — every query in `teacher/routing.ts` is `FROM embeddings` | the Book Reader, the catalog, `lib/work.ts` |
| MEASURED | `db/schema.sql:164-180` | `db/migrations/006_sources_sections.sql:40-64` |

**There is no foreign key between them, and `embeddings.source_id` is a synthesized string in two
mutually incompatible formats:**

**Namespace A — register works** (adapter path, `src/ingest/register-writer.ts:242`):

```
`${sourceType}:${slug}:${si + 1}${chunks.length > 1 ? `.${ci + 1}` : ''}`
    e.g.  sermon:spurgeon-sermons:412.2
```

It encodes the **slug and the section index**. And the same function, ~40 lines later
(`register-writer.ts:294-305`), writes `sections` with `ordinal = i + j + 1` iterating the **same
`work.sections` array in the same order** — so for these works **`si + 1` is `sections.ordinal`**,
and `unit_ordinal` equals `ordinal` because the adapter treats one RegisterSection as one unit
(the comment says so explicitly). A reader position is derivable.

**Namespace B — the classic commentary set** (`src/ingest/source-id.ts:38-44`):

```
commentary:{book_slug}:{chapter}:{verse_start}-{verse_end}:{author}
    e.g.  commentary:jhn:1:1-5:Matthew Henry
```

It encodes a **verse range and an author** — **no slug, no ordinal**. These rows were later
back-filled into `sections` by `migrate-sections-slice.ts`, which re-points the existing vectors
and assigns ordinals through a window join (`migrate-sections-slice.ts:1-13`). **The ordinal was
assigned by that migration and is not recoverable from the key.** For namespace B, a reader
position must be resolved through `section_anchors`, not parsed.

**And the work slug itself is optional.** `retrieve.ts:19-22`, verbatim: the `work` metadata field
is set by ingest for register works and *backfilled for the classic set by author match* —
*"Not every served row has it yet."* That is why `workHref()` returns `null` and why `ResultLink`
renders children unwrapped: **MEASURED, `ask-client.tsx:61-73`** — a result must never look
clickable and fail to navigate. Today's UI already degrades correctly; it just degrades often.

> `source-id.ts`'s header is explicit that this format has exactly one owner and that divergence
> would make coverage checks "silently lie." A new module that *re-parses* these keys would be
> the watchlist's hand-maintained-expected-set artefact in a new costume. §4.2 resolves by
> **lookup against `sections`**, never by trusting a parse.

### 2.3 The reader surfaces, and what each can address

| Surface | Route | Addressing | Deep link to a position? |
|---|---|---|---|
| Book Reader | `/work/[slug]` | slug → `sources.id` → `sections.ordinal` | **Yes** — `#s{ordinal}`, MEASURED `work/[slug]/page.tsx:2-3, 21-25` |
| Study desk | `/desk?p=…` | `encodePane` → `work:{slug}` or `scripture:{book}/{ch}` | **No** — the pane grammar has no ordinal, MEASURED `lib/desk.ts:44-46` |
| Scripture | `/read/[book]/[chapter]` | book + chapter | verse-level via `verseHref` |

**Where an ask result points today: the desk.** `workHref()` = `deskHref(withPane([], {kind:'work', slug}))`
(`ask-client.tsx:61-63`), used at `ask-client.tsx:519` for voices and `:579` for lane chunks. So a
click today opens the work **at its beginning, on a fresh desk** — which for a 118,371-section
work like `spurgeon-sermons` is not "read further from the quote", it is "start the book."

Two further measured behaviours that matter:

- The Book Reader already resolves the exact collision R2 creates: a **deep link wins over the
  saved resume position**, and a "Continue" chip then offers the jump back (`page.tsx:6-8, 40-55`).
  That is already the right behaviour for arriving from an answer.
- `lib/work.ts:170` resolves slug → id **`WHERE status = 'published'`**, and the page lands a 404
  and unknown work "on the same calm dead end." So the reader **already fails closed** on a work
  that has been unpublished or quarantined. This is what §4.4 builds on.

### 2.4 The sidebar, and the retired Channels concept

MEASURED, and it is a shipped owner ruling, not a stale plan:

| Fact | Where |
|---|---|
| "There is no longer a Channels concept in the product." | `docs/UX_REMEDIATION.md` §2, **locked**; CLAUDE.md forbids re-litigating §2 |
| CHANNELS → **PRAYER JOURNAL** in the rail, linking to `/prayers` | `sidebar.tsx:245-262` |
| `/channel/[id]` redirects to `/prayers`, ignoring the id | `channel/[id]/page.tsx:18-20` |
| `/chat/[id]` renders `ComingSoon` — Study Partners, "retired, not deferred" | `chat/[id]/page.tsx`, `UX_REMEDIATION.md` §2 |
| `SEED_SECTIONS` is `[]`; `sidebar.tsx` contains **no `fetch` at all** | `sidebar.tsx:35`, and the `R0` finding `N4` recorded |

Meanwhile the *data layer* named "channels" is built, secured, and has **zero callers**:

| Artefact | MEASURED |
|---|---|
| `channels`, `chats`, `messages`, `chat_memories` + indexes | `db/schema.sql:28-103` |
| RLS policies on all four (`user_id = current_setting('app.current_user_id')`) | `db/schema.sql:233-247` |
| `messages.msg_belongs_to_one` CHECK — exactly one of `channel_id`/`chat_id` | `db/schema.sql:76-79` |
| `messages.sources JSONB`, `messages.metadata JSONB` | `db/schema.sql:70-72` |
| **H1 read belt** (explicit `user_id` beside RLS) and **H2 write belt** (`INSERT…SELECT…WHERE EXISTS` ownership check) | `lib/chat.ts` — audited, the comments cite the findings |
| `/api/channels`, `/api/chats`, `/api/messages` | exist, authed, boundary-validated |

**Naming, per the owner 2026-08-10: the section is "Research History".** That satisfies §2 rather
than breaking it — §2 retired the *word* Channels from the product, and Research History is a new
user-visible name over reused internal machinery (§2.2 of the spec exempts identifiers and wire
fields from the lock). **ASSUMED, and say so if wrong: PRAYER JOURNAL stays exactly where it is,
and Research History is a new section beside it.** `PR1a` is shipped with migration 107 on
production; displacing it would be a regression, and nothing in the request asked for that.

### 2.5 Where the state lives today, end to end

```
ask → useState<Turn[]>        (dies on unmount)
click a voice → /desk?p=work:slug   (different route, no ordinal, starts at the top)
back → /ask remounts → []           (the list is gone)
```

Whether Next's router cache happens to preserve the client tree on a back navigation is
**UNVERIFIED and must not be leaned on** — it is version-dependent, invisible to every check in
this repo, and would make the fix look done while remaining one Next upgrade from regressing.
The design makes back correct by construction instead (§4.3).

---

## 3. The three findings that decide the design

**F1 — R1 and R3 are the same feature.** A thread with a durable id and a URL is what a back
navigation returns to. No separate state-restoration mechanism is needed, or wanted.

**F2 — R2 is a corpus-identity problem, not a link change.** Per §2.2 there is no join key from a
retrieved chunk to a reader position. Namespace A can be resolved by lookup; namespace B must go
through the verse anchors; and an unknown fraction of rows carry no slug at all. **How large that
fraction is, is UNKNOWN and is the single number that decides whether R2 ships as specified.**
Measuring it first is the `quality-slice` rule this repo already enforces: diagnose before fix,
measure before build.

**F3 — a stored transcript bypasses every licensing predicate.** §4.4. This is the one place where
getting the feature wrong is legally irreversible rather than merely annoying.

---

## 4. Design

### 4.1 Storage — reuse `chats` + `messages`

Recommended, subject to §8 S0. One `chats` row per thread (`title` = first question truncated,
`persona = 'ask'`); two `messages` rows per turn (`'user'` question, `'assistant'` answer).
`messages.sources` holds **the full surfaced list** (§2.1) — retrieval + lane chunks, each with
its resolved destination (§4.2), attribution, quote, score, and register label.
`messages.metadata` holds `{ kind, lanes, attempts, verifiedAt, pipelineVersion }`.

Reuse because the tables, the RLS policies, the single-parent CHECK, and the audited H1/H2 belts
already exist; a new table re-earns all of it from zero. `chat_memories` stays unused — the
pipeline has no conversational memory (§7).

**The write is server-side, and this is not negotiable.** The assistant row is written inside
`/api/ask/stream` from the object `teach()` returned, after the verifier passed. If a client could
POST answer text for storage, anything it sends becomes Ancient Paths output the moment it
re-renders from history — attributed, in the product's typography, indistinguishable from verified
output. That is an I1/G1 breach with a durable blast radius. MEASURED: `/api/messages` already
hardcodes `role: 'user'` (`route.ts:41`), so the property holds today — **by one literal, with
nothing guarding it.** §6 I-1 pins it.

Ordering: the **question row is written before `teach()` is called**. A question that crashed the
pipeline is exactly the one a reader wants back, and write-on-completion loses it.

### 4.2 The resolver — one place that turns a retrieved chunk into a destination

A single module, `resolveDestination(chunk) → Destination | null`, is the only thing that knows
how a retrieval row becomes a reader position. Everything else consumes its output. It is called
**once, server-side, at store time**, so the destination is resolved while the row is in hand,
never recomputed per render.

A **ladder**, each rung falling back to the next, and every rung ending in a `sections` lookup
rather than a trusted parse:

| Rung | Input | Destination | Precision |
|---|---|---|---|
| **1** | namespace-A key → candidate slug + ordinal, **verified against `sections`** | `/work/{slug}#s{ordinal}` | the quoted section |
| **2** | slug + `metadata.verseId` → `section_anchors` range → `sections.ordinal` | `/work/{slug}#s{ordinal}` | the section covering the quoted verse |
| **3** | slug only | `/work/{slug}` | the work, from its start |
| **4** | no slug resolvable | **no link** | renders as plain text |

Rung 4 is today's behaviour and is correct: `ResultLink` already renders children unwrapped rather
than producing a link that goes nowhere (`ask-client.tsx:68-73`). It stays.

**Target is `/work/[slug]#s{ordinal}`, not the desk.** The Book Reader is the only surface that can
address a position (§2.3), it already resolves deep-link-vs-resume correctly, and it needs no
contract change. Extending the desk pane grammar to carry an ordinal (`work:{slug}@{ordinal}`) is a
real option for later — but `decodePane` governs URLs that "get pasted into messages between people
studying together," so widening that grammar is its own decision with its own compatibility
question. **Out of scope here; filed in §7.**

**The coverage measurement comes before the code** (§8 S0). Take a representative set of asks,
run the retrieval, and count what fraction of surfaced rows land on rungs 1 / 2 / 3 / 4. Then
pre-register the bar. If most rows land on rung 3, R2 as the owner described it — *land where it
was quoted* — is not deliverable without a slug/ordinal backfill, and that is a corpus slice with
an accuracy re-run attached, not a UI change. **Do not build the UI and discover this afterwards.**

### 4.3 Back, by construction

```
/ask                       → first question; POST creates the thread
                             stream emits { stage:'thread', threadId } BEFORE teach()
                             client replaces the URL with /ask/{threadId}   (no new history entry)
/ask/{threadId}            → the thread, server-read from the DB
  click an item            → /work/{slug}#s{ordinal}     (a real navigation)
  browser back             → /ask/{threadId}             (a real URL; the full list is re-read)
  #turn-{n}                → lands on the turn whose item was clicked
```

Back is correct because the destination is a URL backed by the database — not because any client
state survived. It works across a reload, a new tab, a different device, and a Next upgrade.

The URL swap on the first question uses `replaceState` semantics deliberately: a fresh ask should
not leave an empty `/ask` between the reader and their result when they press back once.

### 4.4 Corpus drift — the licensing exposure

A stored turn holds corpus quotes as JSONB. Rendering it reads that JSONB directly, which
**bypasses every routing and licensing predicate the live path enforces** — `embeddings.served`
(migrations 044/045), the forbidden-provenance filters, the published/staged gate. The library is
not static: on 2026-08-06 `calvin-calcom` and `augustine-confessions` were quarantined back out and
1,484 rows unserved. Under a naive transcript, a work quarantined for a licensing reason keeps
serving its text to every reader who ever asked a matching question — forever, with no query that
would surface it. **Licensing fails closed here** (`AGENTS.md`: a violation is legally
irreversible).

So, at render of a stored turn:

- Re-check current servability for the whole slug set in **one bounded query**
  (`WHERE slug = ANY($1)`, indexed — no N+1, per CLAUDE.md's data rules).
- A work no longer servable renders as a **tombstone that keeps the attribution and drops the
  quote**: *"Matthew Henry's Commentary is no longer available in the library."* The reader learns
  something true; no unlicensed text is displayed; the link is not offered.
- **Fails closed**: any error resolving servability → tombstone, not text.
- Written as a **positive** predicate (`slug = ANY(servable)`), never `NOT unservable` — the
  watchlist's own three-valued-logic trap, where `FALSE OR NULL = NULL` silently skips rows and a
  licensing predicate fails *open*.

The reader surface already fails closed on the same condition (§2.3, `status = 'published'`), so an
un-tombstoned link would land on a dead end rather than leak — but the tombstone is what makes the
history *honest* instead of merely safe.

### 4.5 Transcript, not cache

CLAUDE.md forbids caching or curating answers from a pipeline below the accuracy bar. UX-4 raised
the same worry. The distinction, stated so nobody re-derives it:

| | Cache (prohibited) | Transcript (this) |
|---|---|---|
| Keyed by | the question | a thread id the asker owns |
| Audience | anyone asking something similar | exactly one user — the asker |
| Presented as | the answer, now | what was said to you on `{date}` |
| On re-ask | serves stored bytes | **re-runs the live pipeline**, appends a turn |
| Corpus moves | serves stale text | §4.4 re-checks and tombstones |

Binding: **no lookup by question text, ever** (no index on content, no such code path — this is
what stops a transcript becoming a cache by accident later); stored turns are **immutable and
visibly dated**; "Ask again" appends and never overwrites.

### 4.6 Surfaces

| Surface | What |
|---|---|
| Sidebar **RESEARCH HISTORY** | recent threads + "All research". A new section; PRAYER JOURNAL untouched (§2.4). |
| `/ask` | unchanged for a first-time asker; gains resume-last-thread |
| `/ask/[id]` | the thread — turns in order, each dated and historical, the **full** surfaced list per turn, servability tombstones, and an input that appends |

**Route is `/ask/[id]`** — not `/chat/[id]` (retired, currently `ComingSoon`), not `/channel/[id]`
(shipped redirect). No retired URL is revived and no shipped redirect is disturbed.

**Reads are bounded**: threads list and turns list are both cursor-paginated. `getMessages` already
takes `limit`/`before` and already carries the H1 belt.

**The saved signal.** If persistence fails, the answer still renders — and the turn says it was not
saved. A silent save failure turns "I lost my question" into "I lost my question *and* believed I
hadn't", which is worse than not shipping the feature. This is the `saved` field on `done`.

### 4.7 The Show filter — owner-ruled 2026-08-16, variant A

Two rows of controls, deliberately different jobs, deliberately different places:

**The search row** (exists today, unchanged): the lane checkboxes above the question —
Commentary always on, Sermons / Theology / Historians / Hymns & Poetry checkable. Changing
these changes what is retrieved, so it takes effect on the next ask. The owner rejected
collapsing this into display-only filtering ("B dies"): the user should be able to genuinely
narrow the search, not just the view.

**The Show row** (new): sits between the question and the results, on `/ask` after an answer
and on every turn of `/ask/[id]`. Client-side only — it changes visibility of rows already in
the page. Nothing re-runs, nothing is fetched, no server call. The owner's framing: "I search
5 subjects, I get 150 results, I want to only see hymns to start" — hide the rest, recheck to
bring them back, never overwhelmed and never re-paying the ask latency.

Behaviour:

- One chip per register **that returned results in this turn** — a register that was not
  searched or returned nothing gets no chip. (Owner ruling: no greyed-out placeholder chips;
  "you would not wonder".)
- Each chip carries its **count**, so the reader sees what they are about to hide.
- Uncheck → that register's rows hide, instantly. Recheck → they reappear. Pure display state.
- **"only"** on each chip isolates that register in one click (the 150-results case above,
  without four unchecks).
- **"Show all"** appears only while something is hidden; one click restores the full set.
- All rows hidden → an explicit "everything is hidden" line, never a silently blank pane.

Filter state is **per-turn, ephemeral, and never persisted** — not to the URL, not to the
thread row, not to a preference. A reopened thread always starts with everything visible; the
transcript is the durable record and the filter is a reading aid on top of it. (If a standing
"never show me hymns" preference is ever wanted, that is a new decision, not a default drift.)

The filter reads the same per-item register label the transcript already stores (§4.1
`messages.sources[].register`), so it works identically on a live answer and on a thread
reopened weeks later, and needs no new data.

---

## 5. What this costs if F2 goes badly

Stated up front because it is the likeliest way this design is wrong:

- **Rung 1+2 coverage is high** → R2 ships as specified. UI-and-resolver slice.
- **Coverage is mostly rung 3** → readers land at the top of a work. For short works that is
  tolerable; for `spurgeon-sermons` it is not. Fixing it means backfilling slug/ordinal onto
  `embeddings.metadata` — a corpus operation touching the retrieval path, which drags in the
  accuracy diagnostic and `interpretation_bait` through the live loop. **That is a Lane A slice,
  not this one**, and it should be scoped separately rather than smuggled in.
- Either way **R1 and R3 are unaffected** — they do not depend on the resolver. If R2 is deferred,
  history and back still ship. That is the reason to slice them apart (§8).

---

## 6. Invariants — each ships with its red-proof

`docs/THE_LOOP.md`: a check never watched go RED proves nothing.

| # | Invariant | Red-proof |
|---|---|---|
| I-1 | No HTTP route can write `role='assistant'` | add a route passing a caller-supplied role → red |
| I-2 | The stored assistant payload is `teach()`'s verified result | seed the route to persist an unverified string → red |
| I-3 | No code path reads a stored answer keyed by question text | add a `WHERE content = $q` lookup → red |
| I-4 | A quarantined work's quote is not rendered from history | seed a stored turn with an unserved slug; assert tombstone → red |
| I-5 | The servability check fails closed | make the lookup throw; assert tombstone → red |
| I-6 | Cross-tenant read/write impossible — two real accounts, over `app_runtime` | B guesses A's thread id, on read **and** write → red |
| I-7 | Thread and turn lists are bounded | remove the LIMIT → red |
| I-8 | A stored turn is immutable | attempt an in-place rewrite → red |
| I-9 | `resolveDestination` never emits a link to a section that does not exist | seed a stale ordinal; assert rung-3 fallback, not a broken anchor → red |
| I-10 | Back from a work returns the **full** surfaced list, not the quoted subset | store a turn with 9 surfaced items, 3 quoted; assert 9 on re-read → red |

I-6 asserts that A **does** see A's own rows, not merely that B sees nothing. C5 carries the
standing caveat that **RLS under Neon's user-id format is UNPROVEN and fails silently** —
matches-nothing reads as "no data", so the negative half passes trivially against a policy binding
no value at all.

---

## 7. Out of scope — deliberately

| Not building | Why |
|---|---|
| Conversational follow-up / memory | `teach(question)` takes no history. A thread is a sequence of **independent** questions, and the UI must not imply otherwise. `chat_memories` stays unused. |
| Sharing, groups, cohorts | `N4`: retired, not deferred; any cohort feature is greenfield. |
| Desk panes carrying an ordinal (`work:{slug}@{n}`) | A URL-grammar change to links people paste to each other. Real, separate, filed. |
| Search over history | UX-4's other half; needs its own index decision. |
| A slug/ordinal backfill onto `embeddings.metadata` | §5 — a Lane A corpus slice with an accuracy re-run, if F2 forces it. |
| Ask latency | A retrieval/compose change, gated by the accuracy diagnostic and `interpretation_bait`. Same ruling UX-5 got. |

---

## 8. Slices, and what must be measured first

**S0 — recon. Blocking, no code.** ⚑ Needs an owner go for a read-only production session
(bylaw 7). Three measurements, and no slice starts until they are numbers:

> **S0.1 + S0.2 MEASURED 2026-08-16 under the owner's "build it and ship it" go.** All four
> tables exist on prod (`chats`, `messages`, `channels`, `chat_memories` —
> `information_schema.tables`); `app_runtime` holds **SELECT, INSERT, UPDATE, DELETE** on both
> `chats` and `messages` (`role_table_grants`), and each carries a single `ALL` RLS policy
> (`chats_policy` / `messages_policy`). The 032-narrowing fear in S0.2 did not materialise.
> **D2 resolves: reuse.** S0.3 (resolver coverage) remains unmeasured — S3 ships at the rung
> the data supports, per D5.

1. **Do `chats`/`messages` exist on production?** `db/schema.sql` defines them and **no migration
   on disk creates them.** Migration 032's backfill list names `015_channels.sql` (line 78) — a
   filename that is not in `db/migrations/`, where 015 is `015_highlight_subverse.sql`. The ledger
   says a channels migration was applied and the tree cannot show it to you. A real unknown.
2. **Does `app_runtime` hold UPDATE and DELETE on them?** Watchlist instance fifteen, verbatim:
   032 narrowed `ALTER DEFAULT PRIVILEGES` to SELECT + INSERT, 039 assumed otherwise by citing a
   comment 032 had invalidated, and shipped two features that never worked for anyone until 106
   repaired them. Rename and delete are UPDATE and DELETE. **Measure the grant; do not reason
   about which migration came first.**
3. **The resolver coverage number** (§4.2, F2). Rung 1/2/3/4 distribution over a representative
   ask set, with the bar pre-registered before the run.

**S1 — history (R1).** Thread + server-side write + `thread`/`saved` events. I-1, I-2, I-8.
**S2 — the thread URL and back (R3).** `/ask/[id]`, RESEARCH HISTORY in the rail, `#turn-{n}`.
I-3, I-6, I-7, I-10.
**S3 — open the resource (R2).** The resolver ladder + deep links. I-9. **Gated on S0.3.**
**S4 — drift and management.** Servability tombstones, rename, tombstone delete. I-4, I-5.

S1 and S2 do not depend on S0.3, so a bad coverage number delays R2 without blocking R1/R3.

Browser verification at 390px and desktop is part of Done for S2–S4 (CLAUDE.md DoD). Note the site
sits behind the `/gate` password — the thing that made `N4`'s redirect unobservable to `curl` and
nearly produced an unearned green. Plan the browser pass for an authenticated session.

### Owner decisions

| # | Decision | Blocks | Note |
|---|---|---|---|
| ~~D1~~ | Section name | — | **RULED 2026-08-10: "Research History."** A new section; PRAYER JOURNAL stays (§2.4 — confirm if that assumption is wrong). |
| **D2** | Reuse `chats`/`messages` vs new `ask_threads`/`ask_turns` | S1 | Reuse — subject to S0.1/S0.2. If the tables are absent on prod this flips to new tables and the H1/H2 belts get ported, not re-invented. |
| **D3** | Retention: forever? per-user quota? | S1 | Recommend forever, tombstoned delete — matching every other user artefact here. |
| **D4** | ⚑ The S0 production read | everything | — |
| **D5** | If S0.3 shows poor coverage: ship R2 at rung 3, or fund the backfill? | S3 | **Do not decide this before the number exists.** |
| ~~D6~~ | Merge with UX-4? | — | **Merged by this design.** UX-4's "open a result without losing the search" *is* R2+R3. Its "history probably lives in the study-partner tabs" is **stale** — written 2026-08-02, and `N4` retired Study Partners on 2026-08-08. |

---

## 9. What this design does not claim

- That `chats`/`messages` exist on production, or that `app_runtime` can UPDATE/DELETE them
  (§8 S0.1–2). The ledger and the tree disagree, and neither is a measurement.
- **That R2 is deliverable at the precision the owner asked for.** That depends entirely on the
  §4.2 coverage number, which does not exist yet (F2, §5).
- That RLS binds under Neon's user-id format (C5, carried, silent failure mode).
- That Next's router cache preserves anything across a back navigation (§2.5) — the design does
  not rely on it either way.
- Anything about latency, accuracy, or the faithfulness gates. Persistence adds no LLM call and
  changes no retrieval. If S3 ever changes retrieval, the accuracy diagnostic and
  `interpretation_bait` apply in full.
