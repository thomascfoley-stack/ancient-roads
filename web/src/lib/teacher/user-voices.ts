import { runAsUser } from '@/lib/db';
import { semanticSearch } from '../user-corpus/search';

// The user-voices lane (Slice 4, SERMON_SEARCH_DESIGN §7): the asking user's OWN uploads as
// an ADDITIVE voice set in /ask. §7(b)/(c) and defect H4 make the trust boundary: user voices
// enrich an answer but are never load-bearing — the verifier already excludes them from the
// diversity floors and from passage grounding (v1.ts:287-353), so this module's only jobs are
// (1) retrieve under RLS, (2) label honestly, (3) fail soft. An additive lane must never
// break the exegetical answer, so ANY error here resolves to [] (the register-lane idiom,
// retrieve.ts:88-90).
//
// RLS is DOUBLE-BOUND and both bindings are reused, not rebuilt: semanticSearch runs inside
// runAsUser (the app.current_user_id GUC + migration 100/122's FORCE RLS) AND carries its own
// explicit user_id predicate. No new SQL path to the user tables is created here except the
// anchor-span read, which follows the same pattern.

export const USER_VOICE_K = 3;

export interface UserVoice {
  sectionId: string;
  documentId: string;
  /** The document title — a user voice is attributed doc + "You", never a historical voice (§7(a)). */
  title: string;
  text: string;
  score: number;
  /** Min/max of the section's own anchor rows; the verifier's anchor_offbase check needs the
   *  range the section is actually indexed to. Undefined when the section has no anchors —
   *  the verifier skips the offbase check only then (v1.ts:123). */
  verses?: { start: number; end: number };
}

export async function retrieveUserVoices(
  userId: string,
  queryVector: number[],
  k: number = USER_VOICE_K,
): Promise<UserVoice[]> {
  try {
    const hits = await semanticSearch(userId, queryVector, { limit: k });
    if (hits.length === 0) return [];
    const ids = hits.map((h) => h.sectionId);
    const [rows] = await runAsUser(userId, (sql) => [
      sql.query(
        `SELECT section_id, min(verse_id_start)::int AS s, max(verse_id_end)::int AS e
           FROM user_section_anchors
          WHERE user_id = $1 AND section_id = ANY($2::text[])
          GROUP BY section_id`,
        [userId, ids],
      ),
    ]);
    const spans = new Map(
      (rows as { section_id: string; s: number; e: number }[]).map((r) => [
        r.section_id,
        { start: r.s, end: r.e },
      ]),
    );
    return hits.map((h) => ({
      sectionId: h.sectionId,
      documentId: h.documentId,
      title: h.title,
      text: h.text,
      score: h.score,
      verses: spans.get(h.sectionId),
    }));
  } catch {
    return [];
  }
}

// The composer source block for the user-library section of the prompt. prompt.ts itself is
// NOT touched (byte-identical CLI/web guard, test/web-core-sync.test.ts) — teach.ts appends
// this to buildUserPrompt's output. The SOURCE format mirrors buildUserPrompt's exactly, ids
// continuing after the corpus voices, so the composer cites user sections by the same
// prompt-local section_id mechanism; `origin: user_library` is what normalize-contract +
// the verifier key the trust boundary on.
export function formatUserLibrarySources(voices: UserVoice[], firstId: number): string {
  if (voices.length === 0) return '';
  const blocks = voices.map((v, j) => {
    const id = firstId + j;
    return `--- SOURCE ${id} ---
section_id: ${id}
author: You
work: ${v.title}
tradition: unknown
origin: user_library (the asker's own upload)
verse_range: ${v.verses ? `${v.verses.start}-${v.verses.end}` : 'unanchored'}
score: ${v.score.toFixed(4)}
text:
${v.text}
---`;
  });
  return `The asker's own library (ADDITIVE voices: they may be cited as voice blocks with origin "user_library", but they NEVER count toward the >=2 voices/traditions requirements and cannot ground a passages block):

${blocks.join('\n\n')}`;
}
