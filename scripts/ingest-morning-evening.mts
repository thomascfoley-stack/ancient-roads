/**
 * Ingest Spurgeon's "Morning and Evening" into web/public/devotional/morning-evening.json.
 *
 * SOURCE: archive.spurgeon.org/morn_eve/m_e.html — the Spurgeon Center (Midwestern Baptist
 * Theological Seminary) public-domain archive. Re-provenanced here: NOT CCEL's edition/markup
 * (which DATA_SOURCES.md flags as commercially restricted). The text itself is public domain
 * (Spurgeon d.1892, pre-1929); the KJV it quotes is public domain.
 *
 * The page is ONE static HTML file: per month, all AM entries then all PM entries. Each entry:
 *   <a name="MM/DD/AM"></a> <blockquote>"verse text"&#151;Reference.</blockquote>
 *   <img src=".../images/X.gif">rest-of-word ...body...
 * The dropcap image X.gif encodes the first letter of the body.
 *
 * Output: { "MM-DD": { am: Entry, pm: Entry } }, Entry = { ref, refDisplay, verseText, body,
 * attribution }. Every ref is validated through the repo's parseRef — a ref that does not parse
 * is a broken day and FAILS the ingest (§1). Run: npx tsx scripts/ingest-morning-evening.mts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseRef } from '../web/src/bible/ref-parse.ts';

const SOURCE_URL = 'https://archive.spurgeon.org/morn_eve/m_e.html';
const ATTRIBUTION = 'C. H. Spurgeon, Morning and Evening';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'web/public/devotional/morning-evening.json');

interface Entry {
  ref: string;
  refDisplay: string;
  verseText: string;
  body: string;
  attribution: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#151;/g, '—') // em dash — (Spurgeon's verbatim punctuation; kept, not app-authored)
    .replace(/&#150;/g, '–') // en dash
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#14[56];/g, "'"); // curly apostrophes if present
}

/** Reconstruct the body: dropcap image -> its letter, poetry/paragraph tags -> newlines, strip rest. */
function cleanBody(raw: string): string {
  let s = raw
    // dropcap: <img src=".../images/x.gif" ...> -> uppercase first letter, glued to the word that follows
    .replace(/<img[^>]*\/images\/([a-z])\.gif"[^>]*>/gi, (_m, ch: string) => ch.toUpperCase())
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?center>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p>/gi, '\n\n')
    .replace(/<a name="[^"]*"><\/a>/gi, '')
    .replace(/<h2>[\s\S]*$/i, '') // a trailing month header bleeds in on the last entry of a section
    .replace(/<\/?i>/gi, '')
    .replace(/<[^>]+>/g, ''); // any stray tags
  s = decodeEntities(s);
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function main(): Promise<void> {
  const res = await fetch(SOURCE_URL, { headers: { 'user-agent': 'ancient-paths PD ingest (research)' } });
  if (!res.ok) throw new Error(`fetch ${SOURCE_URL} -> ${res.status}`);
  const html = await res.text();

  // Real day anchors, in document order. The stray <a name="x"> dividers are ignored by the pattern.
  const anchorRe = /<a name="(\d\d)\/(\d\d)\/(AM|PM)">/g;
  const anchors = [...html.matchAll(anchorRe)];
  if (anchors.length !== 732) throw new Error(`expected 732 day anchors, found ${anchors.length}`);

  const out: Record<string, { am?: Entry; pm?: Entry }> = {};
  const failures: string[] = [];

  for (let i = 0; i < anchors.length; i++) {
    const m = anchors[i]!;
    const [mm, dd, half] = [m[1]!, m[2]!, m[3]!];
    const contentStart = m.index! + m[0].length;
    const contentEnd = i + 1 < anchors.length ? anchors[i + 1]!.index! : html.length;
    const content = html.slice(contentStart, contentEnd);

    const bq = content.match(/<blockquote>([\s\S]*?)<\/blockquote>/i);
    if (!bq) {
      failures.push(`${mm}-${dd} ${half}: no blockquote`);
      continue;
    }
    const stripQuotes = (v: string) => v.replace(/^\s*["“]/, '').replace(/["”]\s*\.?\s*$/, '').trim();
    let refRaw: string;
    let verseText: string;
    let afterRef: string; // where the body begins
    const sep = /&#15[01];|—|–/;
    if (sep.test(bq[1]!)) {
      // Format A (731 of 732): <blockquote>"verse"&#151;Reference.</blockquote>
      const parts = bq[1]!.split(sep);
      refRaw = decodeEntities((parts.pop() ?? '').trim()).replace(/\.\s*$/, '').trim();
      verseText = stripQuotes(decodeEntities(parts.join(' ')));
      afterRef = content.slice(bq.index! + bq[0].length);
    } else {
      // Format B (06-02 AM only): ref sits AFTER the blockquote as a styled line ending in <br>.
      verseText = stripQuotes(decodeEntities(bq[1]!));
      const post = content.slice(bq.index! + bq[0].length);
      const refLine = post.replace(/<img[^>]*>/gi, '').match(/^[\s\S]*?(?=<br)/i);
      refRaw = decodeEntities(refLine ? refLine[0] : '').replace(/[^A-Za-z0-9:.\s].*/, '').replace(/[^A-Za-z0-9:]+$/, '').replace(/^[^A-Za-z0-9]+/, '').trim();
      afterRef = post.replace(/<img[^>]*>/i, '').replace(/^[\s\S]*?<br\s*\/?>/i, '');
    }
    const body = cleanBody(afterRef);

    // ★ The anchor is the bridge (§1/§2). It MUST parse or the day is broken.
    const parsed = parseRef(refRaw);
    if (!parsed.ok) {
      failures.push(`${mm}-${dd} ${half}: ref "${refRaw}" did not parse (${parsed.reason})`);
      continue;
    }
    if (!body || body.length < 100) failures.push(`${mm}-${dd} ${half}: body too short (${body.length})`);

    const key = `${mm}-${dd}`;
    (out[key] ??= {})[half.toLowerCase() as 'am' | 'pm'] = {
      ref: refRaw,
      refDisplay: parsed.ref.display,
      verseText,
      body,
      attribution: ATTRIBUTION,
    };
  }

  const days = Object.keys(out).length;
  const complete = Object.values(out).filter((d) => d.am && d.pm).length;
  if (failures.length) {
    console.error(`✗ ${failures.length} FAILURE(S):`);
    for (const f of failures.slice(0, 40)) console.error('  ' + f);
    process.exit(1);
  }
  if (days !== 366 || complete !== 366) throw new Error(`expected 366 complete days, got ${complete}/${days}`);

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`✓ wrote ${OUT}: ${days} days, ${complete} with both AM+PM, 0 anchor-parse failures.`);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
