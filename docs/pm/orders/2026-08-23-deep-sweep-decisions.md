# DEEP_SWEEP — the decisions, for the owner

**Status: DECISION MEMO. Nothing here is executed.** Written 2026-08-23 on `fix/wave0-licensing`.
Companion to `DEEP_SWEEP.md` and `DEEP_SWEEP_PLAN.md`. 35 of 50 findings are fixed on this branch;
these are the ones that need a ruling before code, because each either alters written data, needs
a production write, or picks between designs with different costs.

Every number below was **re-measured by me**, not carried from the sweep. Where I could not
measure, the row says so.

---

## DECISION 1 — D6: the legacy `sourceId` collision. **Re-graded: this is an attribution defect.**

**The sweep filed this P2 as data loss. Measured, it is worse than that, and it is the one item
here I would not leave open.**

`sourceId = commentary:{book}:{chapter}:{vStart}-{vEnd}:{author}` omits the work title
(`src/retrieval/sources/commentary.ts:78`), and the store upserts
`ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING` (`src/retrieval/store.ts:37`).

**Measured against the on-disk corpus, 2026-08-23:**

```
entries scanned:                162,371
distinct sourceIds:             148,025
keys with >1 entry:               7,657
entries lost to DO NOTHING:      14,346   <- the sweep's number, confirmed exactly
```

Classified — and **not one of them is a harmless duplicate**:

| Class | Count | What it means |
|---|---|---|
| Different work, same author | 3,857 | Henry's *Concise* vs *Commentary on the Whole Bible*; Ryle's *Expository Thoughts* vs *Holiness* |
| Same title, different text | 10,489 | Content silently dropped |
| Byte-identical duplicate | **0** | — |

**The part that changes the grade.** `DO NOTHING` conflicts on `(source_type, source_id,
chunk_index)`, so it only blocks the indexes the FIRST writer used. Where a later entry is longer,
its surplus chunks land under the same `source_id`. **3,130 of the 7,657 colliding keys are in
that state** — one `source_id` holding chunks from two different works. `corpus.ts`'s
`getSource(sourceId)` returns the first match's author and title, so a chunk of *Holiness* can be
served attributed to *Expository Thoughts*.

That is not data loss. That is **the attribution guarantee**, which is the product.

**What I could NOT measure:** whether production actually holds interleaved rows. The on-disk
corpus *would* produce them through `pnpm ingest:embeddings` (still the documented live path per
`store.ts:11`), but confirming it needs a production read, which is yours to authorise. **Assume
nothing either way until that query runs.**

**Options**
- **(a) Include a work slug in `sourceId`, then re-ingest.** Correct and permanent. Cost: every
  legacy `source_id` changes, so it is a full re-embed of the flat corpus, and anything that
  stored a `source_id` (saved threads, clippings) needs a migration or tombstoning.
- **(b) Dedupe at merge time**, keeping the richer entry, leaving `sourceId` alone. Cheaper, no
  re-embed. Cost: 3,857 genuinely different works stay unreachable — you would be choosing which
  Matthew Henry the corpus has.
- **(c) Audit first, decide after.** One production query: how many `source_id`s hold chunks whose
  metadata disagrees on `sourceTitle`. That number tells you whether (a) is urgent or theoretical.

**My recommendation: (c) now, then (a).** The audit is cheap and it is the only thing that turns
this from an argument into a decision. I would not ship (b) as the final answer — it resolves an
attribution defect by discarding content.

**Cost of not deciding:** it is already true in the corpus, and every re-run of the CLI re-applies
it. Nothing degrades further by waiting, but nothing improves either.

---

## DECISION 2 — D9 / D10 / D11: the user-corpus reliability triad

These three interlock and should be ruled together; fixing one alone moves the failure rather than
removing it.

- **D9** — retry is allowed mid-parse. `POST /documents/[id]` gates only on `status === 'empty'`
  and `blobUrl`, never on a terminal status, and the UI offers Retry on anything stuck >5 min —
  which is also the stale-claim window, so a *live* worker on a large PDF is legitimately past it.
  Two workers then parse and embed the same document (double spend), and their `storeSections`
  DELETE+INSERT pair is not mutually exclusive under READ COMMITTED.
- **D10** — no incremental embedding progress. `processOne` embeds every chunk in one invocation
  and only then stores; the upload route exports no `maxDuration`. Any document whose embed phase
  outlives the function is killed, reclaimed, and re-embedded **from batch zero** — three times,
  then retired `failed`. The structural defect is certain; the size threshold depends on the
  deployment's `maxDuration`, which cannot be read from the tree.
- **D11** — a blob-store failure leaves a quota-counted row with no blob, and the error text tells
  the user to "upload it again" — which `findByChecksum` then blocks. The only escape is deleting
  the document, which no message mentions.

**Options**
- **(a) Minimum viable, no infrastructure change.** D9: one atomic CAS refusing rows in
  `CLAIMED_STATUSES` with a fresh claim. D11: heal on a dedupe hit where `blob_url` is NULL. D10:
  export a `maxDuration` and cap `drain(max)` — bounds the damage, does not remove it.
- **(b) Do it properly.** Resumable embedding (persist per batch) plus a claim token that
  `storeSections` re-asserts. Removes D9 and D10 at the root. Materially larger.

**My recommendation: (a) now, (b) filed.** (a) is small, closes the two user-visible traps, and
does not commit you to a queue redesign at the end of a long week. But note what (a) leaves: a
document large enough to outlive the function still cannot be ingested — it just fails faster and
more honestly.

**One thing you should decide explicitly either way:** `claimReadingsStart`'s staleness heartbeat
is `updated_at`, which unrelated writes also bump. A retry of a `ready` document re-freshens the
window and can make a dead readings job look live for another 10 minutes.

---

## DECISION 3 — D49: history threads are write-only

**Verified.** `HISTORY_PERSONA` has **zero** consumers outside `history-threads.ts` — grep is
empty. The sidebar lists `/api/research`, which fences on `persona = 'ask'`. `deleteThread` fences
the same way and returns a boolean the route **deliberately discards**, so deleting a history
thread answers **204 having deleted nothing**.

So every `/api/history/search` writes a `chats` row and two `messages` that no surface lists, no
control deletes, and no user can remove.

**Options**
- **(a) Give them a listing and a working delete.** They become a feature.
- **(b) Stop persisting them.** The share URL goes away with them.
- **(c) Persist, but expire.** A TTL sweep.

**My recommendation: (a).** The rows exist because UX-4 wanted shareable history results — that
was a product decision, and (b) reverses it silently. But this is a product call, not an
engineering one, which is why it is here rather than in the branch.

**Cost of not deciding:** invisible unbounded accumulation in `chats`/`messages`, and a delete
control that lies.

---

## DECISION 4 — D22 / D23 / D24 / D25 / D44: ingest corrections that alter written data

**I have NOT independently verified these five.** They are the sweep's claims, and each proposes a
change to how content is written, so each needs a re-ingest decision as well as a code fix:

| # | Claim | The re-ingest question |
|---|---|---|
| D22 | Sermon ingest anchors every citation to chunk 1 only | Do existing sermon anchors get rebuilt? |
| D23 | `merge-commentaries` truncates served entries to 1200 chars and clobbers other writers | Which entries are currently truncated? |
| D24 | `insert-static-author` writes backwards verse ranges cross-chapter | Are there backwards ranges in prod now? |
| D25 | `adapter-helloao` hardcodes `publish: true`, bypassing the manifest serve flag | Did anything publish that the manifest said not to serve? |
| D44 | `ingest-api` exits 0 with silently missing chapters | Which chapters are missing? |

**D25 is the one to look at first** — a hardcoded `publish: true` that bypasses the manifest's
serve flag is the same *class* as D2, which I fixed this week. It may be nothing; it is not
something to leave unverified.

**My recommendation:** let me verify all five before you rule on any. A ruling on an unverified
claim is the failure mode this whole sweep is supposed to prevent.

---

## DECISION 5 — D4: the versification split

**Not verified by me.** The claim: the WEB versification means the Romans doxology (and Rev 12:18,
3 John 15) can never be cited, and an empty verse passes the verifier. That second half is a
verifier claim and I would want to reproduce it before anyone reasons about it.

**My recommendation:** treat as unverified. I will reproduce it next if you want it in scope.

---

## What is already yours and still open from earlier

- **D1's production remediation.** You authorised it. No prod credential is reachable from this
  session (`.env.local` carries dev / `ep-tiny-hat` only), so no count was taken and nothing was
  written. The code fix un-wedges every FUTURE document; rows already stuck in `pending` are
  untouched.
- **Every `BROWSER` leg** on this branch — cluster E and D19. Not mine to mark.
- **D43 is partial by design.** The mechanism to distinguish an auth outage from a missing session
  now exists and is applied to five routes; the other `requireUser` callers still answer 401 on an
  outage. Mechanical to finish, not claimed done.
