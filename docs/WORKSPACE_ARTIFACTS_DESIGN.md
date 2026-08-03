# WORKSPACE ARTIFACTS — saved questions, and why they store citations instead of answers (design doc, 2026-08-02)

**Status: DESIGN — for the owner to react to, NOT approval to build.** No feature code exists. Per the
design-before-code rail (`CLAUDE.md` §Engineering values 2): smallest slice, interfaces named, scaling risks
named, out-of-scope explicit. Three owner decisions gate the build (§9), one of which the owner has
deliberately left open (§7).

**Naming correction, made here rather than left to be discovered.** An earlier draft called this a "Study" and
proposed reusing `study_guides`. Both were wrong. `PRODUCT_ARCHITECTURE.md:36-42` puts Studies (structured
plans, sermon management) in mode 3, and `study_guides` is mode 3's table. What is designed here is
`PRODUCT_ARCHITECTURE.md:28-34`, **Workspace Paths, mode 2**: "assemble sources into saveable, attributed
**artifacts** you reuse." That is the mode `PRODUCT_ARCHITECTURE.md:65` names as the likely first one to build,
so the correction moves this earlier in the sequence, not later.

**Scope honesty.** Mode 2 as written has two halves: a writing canvas (sermon prep, exegesis, notes) and a
collection surface (assemble attributed sources into reusable artifacts). This document designs **only the
collection half**. The writing canvas is a separate design (§8).

---

## 1. The problem this solves

Today an Ask conversation dies on reload. `web/src/components/ask-client.tsx:63` holds turns in
`useState`; nothing is persisted anywhere, by design (`PRODUCT_ARCHITECTURE.md:26`: "Stateless per turn (no
memory, so no cross-turn drift)"). A pastor who asks eight good questions across a week of sermon prep has
nothing at the end of it.

The obvious fix is to save the answers. **The obvious fix is forbidden**, and for a good reason.

## 2. The rule: persist citations, not answers

`CLAUDE.md` §Never: "Cache/curate/ship answers from a pipeline below the accuracy bar." `docs/pm/MASTER.md`
UX-4 states the same concern in the owner's own framing: "caching generated output is governed by the accuracy
bar and goes stale when the corpus moves, as it just did."

Both are satisfied by storing what the answer *pointed at* rather than what it *said*:

> **A saved question stores the user's own words, the section IDs that were cited, the verse anchors, and the
> corpus identity at the time. It stores no generated text. On revisit, the sources are re-read from the corpus
> and re-rendered under the current admission predicates.**

Three properties fall out, and each is something caching the answer cannot do:

1. **A quarantine ruling reaches history.** When a work is withdrawn, every saved question that cited it stops
   showing it, immediately, everywhere. A cached answer would keep serving the withdrawn work forever. This is
   the exact failure the flat store already has in the live path (`web/src/lib/legal-corpus.ts:74-78`: `barnes-notes`
   is `staged` in `sources` while 21,036 rows still serve), and it is much worse in stored history because
   nobody is looking at it.
2. **A corrected section corrects the history.** ADR-029's attribution repairs would have propagated.
3. **No app-voice prose is stored, so nothing re-arms V2.** `ROADMAP.md:237-242` makes V2 a required pre-ship
   gate the moment the app-voice generative surface expands. A saved question renders question, quotes,
   attribution and passages. There is no framing sentence in it, because there is nothing to store one in.

The cost is that the framing sentence is lost. That is the right trade: the framing sentence is the only part
of an answer the product wrote, it is the part `OUTPUT_CONTRACT.md:73-80` most tightly constrains, and it is the
part a reader least needs on a second reading.

## 3. Interface

```ts
// web/src/lib/workspace/types.ts
export interface SavedQuestion {
  id: string;
  workspace_id: string | null;      // null = saved but unfiled
  question: string;                 // the USER's words. Never generated.
  section_ids: number[];            // what the answer cited, in display order
  anchors: VerseRange[];            // the passages it grounded
  result_kind: 'answer' | 'empty' | 'fallback';
  corpus_hash: string;              // corpus identity at ask time
  asked_at: string;
}

/** Re-reads the cited sections under CURRENT admission and reports what changed. */
export function rehydrate(saved: SavedQuestion): Promise<{
  voices: RenderedVoice[];
  dropped: number;                  // cited sections no longer admitted
  corpus_moved: boolean;            // corpus_hash differs from current
}>;
```

`corpus_hash` is not decorative. `scripts/predeploy-gate.ts` already computes a corpus identity hash and
compares it against a committed manifest, so the value exists and is cheap. Storing it lets a revisited
question say "the library has grown since you asked this" and offer to re-ask, which is honest about the exact
staleness UX-4 worried about. Without it the product would silently show a thinner set of voices than the user
remembers and look broken.

`dropped` is surfaced, not hidden: "1 source cited here is no longer available." Silently showing four voices
where the user remembers five is the kind of quiet difference that destroys trust in a citation product.

## 4. The container, and how it stays flat

```ts
export interface Workspace {
  id: string;
  title: string;                    // user-authored
  created_at: string;
  updated_at: string;
}
```

A workspace holds saved questions, saved passages, and a desk URL. That is the whole model.

`PRODUCT_ARCHITECTURE.md:50` defers "customizable parent-child hierarchy (Studies > Sermons > ...) → build flat
first." This respects it in a specific, checkable way: **a workspace has no parent, workspaces do not nest, and
a saved item belongs to at most one workspace.** One level, not configurable. If that turns out to be wrong,
the fix is a migration, not an unwinding.

`PRODUCT_ARCHITECTURE.md:30` is equally explicit that this is "NOT shared/multi-user." No sharing, no
permissions, no presence in this design.

## 5. Data model

```sql
-- migration 039 (re-measure the next free number; other work may land first)
CREATE TABLE workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workspaces_user ON workspaces(user_id, updated_at DESC);

CREATE TABLE saved_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  question      TEXT NOT NULL,
  section_ids   INTEGER[] NOT NULL,
  anchors       JSONB NOT NULL DEFAULT '[]',
  result_kind   TEXT NOT NULL CHECK (result_kind IN ('answer','empty','fallback')),
  corpus_hash   TEXT NOT NULL,
  asked_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_saved_questions_user ON saved_questions(user_id, asked_at DESC);
```

Standard block on both: `ENABLE ROW LEVEL SECURITY`, cmd=ALL policy on
`current_setting('app.current_user_id', true)` in both `USING` and `WITH CHECK`, no new `GRANT`, all access via
`runAsUser`, explicit `WHERE user_id = ...` belt in every query, and the `INSERT ... SELECT ... WHERE EXISTS`
pattern (`web/src/lib/chat.ts:122-134`) for any write that names a `workspace_id` the caller must own. Both
classified in `USER_TABLE_SPEC` or `test/invariants/user-data-invariant.test.ts` goes red.

`ON DELETE SET NULL` on `workspace_id` is deliberate: deleting a workspace must not delete the user's saved
questions. Deletion of a container should never be a silent deletion of contents.

**RLS proven with two real accounts, not by reading policy** (`CLAUDE.md` §Security). `docs/pm/MASTER.md`
records that neither product walk used a second account, so "nothing in either walk says anything about RLS."
This feature does not get to inherit that.

### 5.1 Note on `section_ids INTEGER[]`

A junction table would be more normal. The array is chosen because the only query is "give me this saved
question's sections in display order," which is one `= ANY($1)` against a primary key plus an in-memory
reorder. A junction table adds a join and an ordering column for no read this feature performs. If a future
query needs "every saved question citing section N," that is the moment to normalize, and it is a migration.
Recorded so the choice is visible rather than assumed.

## 6. Scaling

At 1M users the read is `WHERE user_id = $1 ORDER BY asked_at DESC LIMIT n`, index-covered, bounded. That part
is fine.

**The cost is in `rehydrate`.** A history page showing 20 saved questions at 5 sections each is 100 section
bodies. Named mitigations, because `CLAUDE.md` forbids unbounded result sets and there is no cache layer
anywhere in this app:

- The list view renders question, date and a source count only. It does **not** rehydrate. One indexed query,
  no section reads.
- Rehydration happens on opening a single saved question: one `= ANY` over `sections` by primary key.
- Section bodies are truncated at read for the quote, not fetched whole and truncated in the client.
- `corpus_hash` comparison is a string compare against a value already in memory, not a query.

Per the project rule to store derived values rather than compute them: store `source_count` and
`tradition_count` on the row at save time so the list view never touches `sections` at all. They are display
values that cannot change without the underlying section changing, and `dropped` at render already covers the
case where one does.

## 7. Relationship to UX-4, which the owner paused on purpose

`docs/pm/MASTER.md` UX-4 is filed as "deliberately NOT designed (owner is mid-thought and said so)." That is
respected here: this document answers one of its three open questions and leaves the other two alone.

| UX-4 item | Status there | Here |
|---|---|---|
| Click a result opens it in the reader without losing the search | **Settled** | Assumed, not redesigned |
| Searches persist with history | **Settled** | This document is the storage half of it |
| History probably lives in the study-partner tabs | **Settled (probably)** | A placement call, deliberately not taken here. The data model does not care which tab renders it |
| Which thing opens: the anchored passage, or the voice's own work | **Open** | Left open |
| Per-device or per-account history | **Open** | **A server table decides this: per-account.** Flagged as a decision in §9, not slipped in as an assumption |
| Whether a stored search keeps the answer | **Open** | **Answered: no.** §2 |

One scope distinction worth stating: UX-4 says "searches," and the app has two different things called that.
Corpus search results (`/api/search/*`) are retrieval, not generated, so storing them whole breaks no rule and
is a much smaller design. Ask history is the one governed by the accuracy bar. This document is about Ask
history. The two can share the `workspaces` container and should not share a table.

## 8. Out of scope

- **The writing canvas.** Mode 2's other half (sermon prep, exegesis, free-form notes). Bigger than this and
  independent of it.
- **Sharing, collaboration, presence, permissions.** `PRODUCT_ARCHITECTURE.md:52`.
- **Nested workspaces, tags on workspaces, templates.** Flat first (`PRODUCT_ARCHITECTURE.md:50`).
- **Re-asking automatically when the corpus moves.** The product offers; it does not silently re-run a paid
  pipeline on the user's behalf.
- **Storing the framing sentence, the summary, or any generated text**, under any flag, for any reason. This is
  the whole design.
- **Chat and channels.** `web/src/app/chat/[id]/page.tsx` and `channel/[id]/page.tsx` are stubs that say the
  study assistant "arrives with the trained model," and `ROADMAP.md:409` files them P2. A workspace is not a
  chat thread, and the multi-turn tables (`chats`, `messages`, `chat_memories`) are not used here.

## 9. Owner decisions

| # | Decision | Blocks |
|---|---|---|
| 9.1 | Is history per-account? A server table makes it so. Per-device would be localStorage and a different, much smaller design | the whole data model |
| 9.2 | Is losing the framing sentence acceptable? §2 argues yes; it is the owner's product call, not an engineering one | §2 |
| 9.3 | Does this land inside UX-4's slice, or after it? MASTER.md notes UX-4 "should be one slice" with UX-1 | sequencing |

Proposed **ADR-046** (next free number is 046 after ADR-045 in `STUDY_PLANS_DESIGN.md`; re-measure): "Ask
history stores citations, not generated answers." Records: no generated text is persisted; admission and
attribution are re-evaluated at render; `corpus_hash` makes staleness visible rather than silent; this is what
lets a quarantine ruling reach saved history.

## 10. Smallest slice, and its red-proofs

1. **`saved_questions` + RLS, no UI.** Red-proof: two real accounts, B cannot read, write or delete A's saved
   question, through the HTTP routes and not only the data layer.
2. **Save from the Ask surface**, list view only, no rehydration. Proves the write path and the bounded read.
3. **`rehydrate` + the open view.** Red-proof: save a question citing a published work, flip that work to
   `staged`, reopen the saved question, and watch the source disappear with `dropped: 1` shown. **That test is
   the entire justification for this design** and it must be watched go red against a cached-answer
   implementation before it is trusted.
4. **`corpus_hash` staleness banner.** Red-proof: save, change the corpus manifest, reopen, banner appears.
5. **`workspaces` + filing.** Last, because saved-but-unfiled is useful on its own and a container with nothing
   to hold is not.
