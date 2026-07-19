// Two-account RLS tenancy for the Phase 3 annotation tables, EXECUTED against a real DB
// through the app's own runAsUser path (app_runtime, NOBYPASSRLS) — not by reading policy.
//
// WHY THIS FILE EXISTS: the Phase 3 commits claimed "RLS proven with two accounts", but the
// only in-tree assertion was a pg_policies existence count — which passes for a policy of
// USING (true). CLAUDE.md §Security and design §4 both say verbatim: "Verify it with two
// accounts, not by reading policy." An independent audit called that out; this is the fix.
// If anyone widens a USING clause on any of these tables, THIS goes red.
//
// Uses requireDbInCi() (the repo's visible-skip machinery) rather than a private guard, so the
// dedicated db-invariants CI job runs it for real and a missing URL fails loudly there.
// app_runtime is all it needs — no owner role — so it runs wherever the tenancy suites run.
//
// Cleanup HARD-deletes (not the app's soft-delete) so this suite leaves no residue on the
// shared dev DB.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listHighlights, listNotes } from '@/lib/annotations';
import { getDb, runAsUser } from '@/lib/db';
import { requireDbInCi } from '../helpers/env';

const dbUrl = requireDbInCi();
const A = `qa-rls-a-${Date.now()}`;
const B = `qa-rls-b-${Date.now()}`;

let sectionId = '';
let sourceId = '';
let tagId = '';

describe.skipIf(!dbUrl)('Phase 3 annotation tables — two-account RLS tenancy (executed)', () => {
  beforeAll(async () => {
    // corpus reads are public (sources/sections policies are `using (true)`)
    const [secs] = await runAsUser(A, (sql) => [sql`SELECT id FROM sections ORDER BY id LIMIT 1`]);
    const [srcs] = await runAsUser(A, (sql) => [sql`SELECT id FROM sources ORDER BY id LIMIT 1`]);
    sectionId = String((secs as { id: string }[])[0]!.id);
    sourceId = String((srcs as { id: string }[])[0]!.id);

    // A writes one row into every Phase 3 surface, through RLS (WITH CHECK must accept user A)
    await runAsUser(A, (sql) => [
      sql`INSERT INTO notes (user_id, target_kind, section_id, body) VALUES (${A},'section',${sectionId},'A private section note')`,
      sql`INSERT INTO highlights (user_id, target_kind, section_id, source_content_hash, span_start, span_end, color)
          VALUES (${A},'section',${sectionId},'deadbeefhash',0,5,'yellow')`,
      sql`INSERT INTO bookmarks (user_id, target_kind, section_id, label) VALUES (${A},'section',${sectionId},'A spot')`,
      sql`INSERT INTO library_items (user_id, source_id, shelf) VALUES (${A},${sourceId},'reading')`,
      sql`INSERT INTO reading_progress (user_id, source_id, last_ordinal, percent) VALUES (${A},${sourceId},7,0.25)`,
    ]);
    const [tag] = await runAsUser(A, (sql) => [
      sql`INSERT INTO tags (user_id, name) VALUES (${A},'A-private-tag') RETURNING id`,
    ]);
    tagId = String((tag as { id: string }[])[0]!.id);
    await runAsUser(A, (sql) => [
      sql`INSERT INTO annotation_tags (user_id, tag_id, target_type, target_id)
          VALUES (${A},${tagId},'bookmark',gen_random_uuid())`,
    ]);
  }, 60_000);

  afterAll(async () => {
    if (!dbUrl) return;
    for (const u of [A, B]) {
      await runAsUser(u, (sql) => [
        sql`DELETE FROM annotation_tags WHERE user_id = ${u}`,
        sql`DELETE FROM tags WHERE user_id = ${u}`,
        sql`DELETE FROM reading_progress WHERE user_id = ${u}`,
        sql`DELETE FROM library_items WHERE user_id = ${u}`,
        sql`DELETE FROM bookmarks WHERE user_id = ${u}`,
        sql`DELETE FROM highlights WHERE user_id = ${u}`,
        sql`DELETE FROM notes WHERE user_id = ${u}`,
      ]);
    }
  }, 60_000);

  it('A sees exactly its own row in every Phase 3 table', async () => {
    const [n, h, b, l, p, t, at] = await runAsUser(A, (sql) => [
      sql`SELECT count(*)::int AS n FROM notes WHERE target_kind = 'section'`,
      sql`SELECT count(*)::int AS n FROM highlights WHERE target_kind = 'section'`,
      sql`SELECT count(*)::int AS n FROM bookmarks`,
      sql`SELECT count(*)::int AS n FROM library_items`,
      sql`SELECT count(*)::int AS n FROM reading_progress`,
      sql`SELECT count(*)::int AS n FROM tags`,
      sql`SELECT count(*)::int AS n FROM annotation_tags`,
    ]);
    for (const [label, r] of Object.entries({ notes: n, highlights: h, bookmarks: b, library_items: l, reading_progress: p, tags: t, annotation_tags: at })) {
      expect((r as { n: number }[])[0]!.n, `A should see its own ${label}`).toBe(1);
    }
  }, 60_000);

  it('user B sees NONE of user A rows in any Phase 3 table (the isolation boundary)', async () => {
    const [n, h, b, l, p, t, at] = await runAsUser(B, (sql) => [
      sql`SELECT count(*)::int AS n FROM notes`,
      sql`SELECT count(*)::int AS n FROM highlights`,
      sql`SELECT count(*)::int AS n FROM bookmarks`,
      sql`SELECT count(*)::int AS n FROM library_items`,
      sql`SELECT count(*)::int AS n FROM reading_progress`,
      sql`SELECT count(*)::int AS n FROM tags`,
      sql`SELECT count(*)::int AS n FROM annotation_tags`,
    ]);
    for (const [label, r] of Object.entries({ notes: n, highlights: h, bookmarks: b, library_items: l, reading_progress: p, tags: t, annotation_tags: at })) {
      expect((r as { n: number }[])[0]!.n, `B must not see A ${label}`).toBe(0);
    }
  }, 60_000);

  it('user B cannot DELETE user A rows — A still has them afterwards', async () => {
    await runAsUser(B, (sql) => [
      sql`DELETE FROM bookmarks WHERE user_id = ${A}`,
      sql`DELETE FROM library_items WHERE user_id = ${A}`,
      sql`DELETE FROM reading_progress WHERE user_id = ${A}`,
      sql`DELETE FROM tags WHERE user_id = ${A}`,
    ]);
    const [b, l, p, t] = await runAsUser(A, (sql) => [
      sql`SELECT count(*)::int AS n FROM bookmarks`,
      sql`SELECT count(*)::int AS n FROM library_items`,
      sql`SELECT count(*)::int AS n FROM reading_progress`,
      sql`SELECT count(*)::int AS n FROM tags`,
    ]);
    for (const [label, r] of Object.entries({ bookmarks: b, library_items: l, reading_progress: p, tags: t })) {
      expect((r as { n: number }[])[0]!.n, `A ${label} must survive B's delete`).toBe(1);
    }
  }, 60_000);

  it('user B cannot FORGE a row owned by user A (WITH CHECK)', async () => {
    await expect(
      runAsUser(B, (sql) => [
        sql`INSERT INTO bookmarks (user_id, target_kind, section_id) VALUES (${A},'section',${sectionId})`,
      ]),
    ).rejects.toThrow(/row-level security/i);
  }, 60_000);

  // Regression for the audit's finding that dropping `verse_id NOT NULL` broke the verse-scoped
  // read paths: listNotes/listHighlights filtered only (user_id, deleted_at), so the moment a
  // SECTION row exists they returned it with verse_id = null and the "My library" page rendered
  // "Book 0 0:0" linking to '#'. Both queries now filter target_kind='verse'.
  it('section annotations do NOT leak into the verse-scoped Bible lists', async () => {
    const notes = await listNotes(A, 50);
    const highlights = await listHighlights(A, 50);
    // A's ONLY note and ONLY highlight are section-anchored, so the verse lists must be empty.
    expect(notes.map((n) => n.verse_id)).toEqual([]);
    expect(highlights.map((h) => h.verse_id)).toEqual([]);
  }, 60_000);

  it('with NO app.current_user_id set, the tables return zero rows (fail-closed backstop)', async () => {
    const sql = getDb();
    for (const rows of [
      await sql`SELECT count(*)::int AS n FROM bookmarks`,
      await sql`SELECT count(*)::int AS n FROM library_items`,
      await sql`SELECT count(*)::int AS n FROM reading_progress`,
      await sql`SELECT count(*)::int AS n FROM tags`,
      await sql`SELECT count(*)::int AS n FROM annotation_tags`,
    ]) {
      expect((rows as unknown as { n: number }[])[0]!.n).toBe(0);
    }
  }, 60_000);
});
