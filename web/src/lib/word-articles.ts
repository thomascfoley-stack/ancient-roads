import { getDb } from './db';

// Reference-shelf articles for one Strong's key (docs/WORD_REFERENCE_PANE_DESIGN.md).
//
// SERVING STAYS DB-GATED: only `status='published'` lexicon works answer, so the owner's flip
// is what lights the shelf and a quarantine darkens it instantly — deliberately NOT a static
// extraction, which would bypass the licensing rails the corpus serves under.
//
// The key match is the section HEADING: BDB and Thayer's carry the Strong's number as the
// heading's first token ("H5867 עֵילָם …", "G3999 πεντάκις"), so `= key OR LIKE key || ' %'`
// is exact — the trailing space stops H43 from matching H430. Index honesty (design §index):
// the indexed filter is the sources join (a handful of lexicon source_ids); heading is a
// residual filter over those works' rows, measured acceptable on dev; an expression index is
// the one-line follow-up if it ever isn't.

export interface WordArticle {
  work: { slug: string; title: string; author: string | null; license: string | null };
  heading: string;
  body: string;
  ordinal: number;
}

interface Row {
  slug: string; title: string; author: string | null; license: string | null;
  heading: string; body: string; ordinal: number;
}

export async function fetchWordArticles(strongs: string): Promise<WordArticle[]> {
  const sql = getDb();
  const rows = (await sql.query(
    `SELECT src.slug, src.title, src.author, src.license,
            sec.heading, sec.body, sec.ordinal
       FROM sections sec
       JOIN sources src ON src.id = sec.source_id
      WHERE src.source_type = 'lexicon'
        AND src.status = 'published'
        -- Textually the partial index's own predicate (migration 123). The planner uses a
        -- partial index only when the query predicate IMPLIES the index predicate, and it
        -- cannot prove a LIKE implies a regex — stating the predicate verbatim makes the
        -- implication trivial. Measured: 2,497 ms cold unindexed → 0.088 ms with this line
        -- (docs/evidence/lexqa-2026-08-21/). Same rule migration 119 documents.
        AND sec.heading ~ '^[GH][0-9]'
        AND (sec.heading = $1 OR sec.heading LIKE $1 || ' %')
      ORDER BY src.title, sec.ordinal
      LIMIT 20`,
    [strongs],
  )) as Row[];
  return rows.map((r) => ({
    work: { slug: r.slug, title: r.title, author: r.author, license: r.license },
    heading: r.heading,
    body: r.body,
    ordinal: r.ordinal,
  }));
}
