# Citing your own upload inside a study — design, and the one owner action it needs

Filed 2026-09-07 under the owner's "fix #3 the best way". The rename half shipped (ADR-123); this
is the half that cannot, and why, and exactly what unblocks it.

## The gap, in one line

You can insert Matthew Henry into a study. You cannot insert your own sermon — even though both
features are live, and the whole point of My Works is that your manuscript sits beside the
tradition.

Grep confirms it: `web/src/components/study-editor.tsx` and `study-library-panel.tsx` contain zero
references to user-corpus, uploads or My Works.

## Why it is not a small change

Two structural facts, both deliberate:

1. **`study_blocks` requires a corpus key on every clipping.** `db/migrations/110_studies.sql`:
   ```sql
   CHECK ( kind <> 'clipping' OR (source_id IS NOT NULL OR section_id IS NOT NULL) )
   ```
   `source_id` is an embeddings key; `section_id` is `sections.id` — the licensed corpus. A user's
   own chunk lives in `user_sections`, which neither column can address. A clipping of your own
   work is currently unrepresentable, by constraint.
2. **The library panel is corpus-only on purpose.** `app/api/studies/library-search/route.ts`:
   "CORPUS GROUPS ONLY, by design: a clipping is a stored corpus quote (F2); personal domains are
   searched on /search, not clipped from here." The clipping POST then re-runs the full licensing
   gate (published + provenance + ownership) inside its own `INSERT…SELECT`.

That second gate is the interesting one. It exists because a corpus quote must be legally
serveable. **Your own words need the opposite test**: not "is this published and unencumbered" but
"is this yours". Same column, opposite predicate — which is exactly why overloading `source_id`
with a `user:<doc>:<ordinal>` string would be a mistake. Every reader that resolves `source_id`
against the corpus would mis-resolve it, and the licensing gate would be asked a question about a
row it has no business judging.

## The design

**Migration `129_study_blocks_user_section.sql`** (written when the owner says go, not before):

```sql
ALTER TABLE study_blocks ADD COLUMN IF NOT EXISTS user_section_id UUID;
-- A clipping resolves to exactly ONE origin: the corpus (source_id/section_id) or your own
-- work (user_section_id). Never both, never neither.
ALTER TABLE study_blocks DROP CONSTRAINT IF EXISTS study_blocks_clipping_key;
ALTER TABLE study_blocks ADD CONSTRAINT study_blocks_clipping_key
  CHECK ( kind <> 'clipping'
          OR ( (source_id IS NOT NULL OR section_id IS NOT NULL) <> (user_section_id IS NOT NULL) ) );
```

**The write path.** A new branch in the clipping POST whose `INSERT…SELECT` gate is ownership, not
licensing:

```sql
INSERT INTO study_blocks (…, user_section_id, quote, attribution)
SELECT …, s.id, s.body, jsonb_build_object('author', 'You', 'work_title', d.title, 'reference', s.ordinal)
  FROM user_sections s JOIN user_documents d ON d.id = s.document_id
 WHERE s.id = $1 AND s.user_id = $2 AND d.user_id = $2
```

Two `user_id` predicates and `runAsUser`'s RLS binding, the same belt-and-braces every statement in
`documents.ts` uses.

**The read path.** `attribution` already carries what the block renders, so an existing study
renders a user clipping with no change. The `/ask` lane settled the attribution question already —
user voices render as "From your library" — so the study surface copies that rather than inventing
a second vocabulary.

**The search path.** `library-search` gains a personal group, gated on the same
`guardUser`/allowlist the user-corpus routes use, reusing `lib/user-corpus/search.ts`. The route's
"corpus groups only" comment gets amended, not deleted, and says what changed and why.

**Flow D (the purge).** `docs/…` records that a clipping's quote can be purged and re-hydrated from
its corpus keys. A user clipping has no corpus key to re-hydrate from — but it also has no
licensing reason to be purged, since the text is the user's own. The purge must therefore SKIP
`user_section_id` rows rather than tombstone them; that is a clause in the purge query and a test,
and it is the one place this change could quietly destroy someone's work if missed.

## The owner action

**Apply migration 129 to production, then say so — the code ships after, never before.** This repo
has already paid for the other order once ("my own migration-before-code inversion", 2026-08-24):
code that reads a column production does not have breaks every study page until the migration
lands. The migration is additive and its rollback is one `DROP COLUMN` plus restoring the old
CHECK.

Estimated after that: two to three days, one branch, red-first per clause above.

## Not doing

Editing the extracted TEXT of an upload. Nothing exists for it, and a save would have to re-chunk,
re-anchor and re-embed the document — a paid run per keystroke-batch. If the extraction is wrong
the honest remedy is still delete and re-upload, and the rename shipped in ADR-123 at least means
the replacement can carry the name you already gave it.
