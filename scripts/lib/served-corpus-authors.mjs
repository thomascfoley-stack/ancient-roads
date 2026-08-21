// WHAT THE STATIC CORPUS ACTUALLY SHIPS, BY AUTHOR.
//
// THE DEFECT THIS EXISTS TO CATCH (2026-08-02 deep audit, C2). `web/public/commentaries/` is
// served as unauthenticated static files, and the licence filter — `isPublishedCommentaryEntry`
// — runs in the BROWSER, at `web/src/lib/bible.ts:132`, inside `fetchCommentary`, AFTER Next has
// already delivered the file. The filter decides what to RENDER. It has no bearing on what is
// DELIVERED. Anyone who fetches `/commentaries/1ch/1.json` directly receives every entry in it.
//
// Measured on the shipping tree at the time of the audit: 1,212 files, 191,749 entries, 381 MB
// of text, of which
//
//     15,161 entries   Tyndale Study Notes      on MUST_NOT_SERVE_AUTHORS
//      1,272 entries   Origen of Alexandria     on MUST_NOT_SERVE_AUTHORS
//         36 entries   Oecumenius               on MUST_NOT_SERVE_AUTHORS
//      1,102 entries   CS Lewis                 d. 1963, in copyright
//        714 entries   GK Chesterton            d. 1936
//         16 entries   Douglas Wilson           LIVING author, scraped from his own site
//         11 entries   JRR Tolkien              d. 1973, in copyright
//
// The existing provenance ratchet reports green over all of it, for three independent reasons:
// it scans only `entry.sourceUrl`; its forbidden-domain list has three entries and none of these
// sources is on it; and `forbiddenProvenanceDomain('')` returns null, so an empty sourceUrl
// counts as clean. Licence handling fails closed on unknown; provenance fails OPEN.
//
// THIS MODULE DOES NOT DELETE ANYTHING. Removing corpus content is a content-quarantine decision,
// which AGENTS.md reserves to the owner ("do not make owner-level calls — content quarantine,
// prod deletion, deploy timing — yourself"). It measures, and `predeploy-gate.ts` refuses to
// deploy while the measurement is non-zero. The deploy is blocked until the owner rules; the
// bytes are not touched by an agent.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Authors that must never be SERVED, mirrored from web/src/lib/legal-corpus.ts.
 *
 * WHY A COPY EXISTS HERE AND WHY IT IS SAFE. This runs under plain node in the deploy gate and
 * cannot import a `.ts` module from `web/src`. A hand-maintained copy is the defect class this
 * repo has paid for most often — so it is not trusted: `test/invariants/served-corpus-authors.test.ts`
 * asserts this list is IDENTICAL to the shipped `MUST_NOT_SERVE_AUTHORS`, and goes red the moment
 * either side gains or loses a name.
 */
export const MUST_NOT_SERVE = [
  'Tyndale Study Notes',
  'Tyndale Open Study Notes',
  'Theophylact',
  'Bonaventure',
  'Oecumenius',
  'Origen',
  'Origen of Alexandria',
  'Aquinas-Larcher',
  // Owner ruling 2026-08-18 (§17.10). The four modern copyrighted authors this file's own header
  // has measured in the static corpus since the 2026-08-02 audit — CS Lewis 1,102, GK Chesterton
  // 714, Douglas Wilson 16, JRR Tolkien 11 — plus Pseudo-Origen, which the ruling extends the
  // standing Origen veto to. Adding them here is what makes predeploy-gate.ts SEE them.
  'CS Lewis',
  'GK Chesterton',
  'Douglas Wilson',
  'JRR Tolkien',
  'Pseudo-Origen',
];

/**
 * Authors who died recently enough that their work is in copyright somewhere that matters, and
 * which no licence record covers. Distinct from MUST_NOT_SERVE, which is an editorial ruling.
 * This list is the audit's finding, not a legal opinion — each is a question for the owner.
 */
export const IN_COPYRIGHT_SUSPECTS = ['CS Lewis', 'GK Chesterton', 'JRR Tolkien', 'Douglas Wilson'];

/** Same normalisation the shipped predicate uses, so "Origen of Alexandria" ~ "Origen". */
export function isMustNotServe(author) {
  if (typeof author !== 'string') return false;
  if (MUST_NOT_SERVE.includes(author)) return true;
  const first = author.split(/\s+(of|the)\s+/i)[0]?.trim();
  if (first && first !== author && MUST_NOT_SERVE.includes(first)) return true;
  // NAME-PREFIX. Added 2026-08-18 — the shipped guard gained this rule and this copy did not, and
  // the invariant that exists to stop exactly that drift compared only the two LISTS, never the two
  // MATCHERS. Measured cost of the gap: `CS Lewis  (via the character Screwtape, a devil)` (70
  // entries) and `Pseudo-Origen  (as quoted by Aquinas, AD 1274)` (12) were blocked by the shipped
  // code and INVISIBLE here — i.e. `predeploy-gate.ts` would have cleared 82 entries of vetoed
  // material for delivery as unauthenticated static JSON while printing green.
  if (MUST_NOT_SERVE.some((n) => author.startsWith(`${n} `))) return true;
  return author.startsWith("Jerome's");
}

/**
 * SURNAME-TOKEN RULE — the chesterton-preexistence hole, closed 2026-08-21 (owner close-out,
 * ADR-112 follow-up). Measured hole: 5 static-corpus entries carried author
 * 'Chesterton, Gilbert Keith' — surname-first, so every rule above missed them and the gate
 * printed green over entries whose PD basis was void (the text cites the NIV, 1978; it is not
 * Chesterton at all). The veto knew the NAME; it could not see the SURNAME in another format.
 *
 * These three lists are COPIES of web/src/lib/must-not-serve-audit.ts — same reason as
 * MUST_NOT_SERVE above (plain node cannot import the .ts module), same discipline:
 * test/invariants/served-corpus-authors.test.ts asserts all three are identical to the shipped
 * side and goes red the moment either drifts.
 */
export const MUST_NOT_SERVE_SURNAMES = [
  'tyndale', 'theophylact', 'bonaventure', 'oecumenius', 'origen',
  'larcher', 'lewis', 'chesterton', 'wilson', 'tolkien', 'jerome',
];

/** ADR-112 admissions: works of a vetoed author an owner ruling admits anyway. Value = first-
 *  publication year; admitted only when < ADR112_CUTOFF_YEAR. */
export const MUST_NOT_SERVE_WORK_EXCEPTIONS = {
  'chesterton-america': 1922,
  'chesterton-ball-cross': 1909,
  'chesterton-defendant': 1902,
  'chesterton-divorce': 1920,
  'chesterton-eugenics': 1922,
  'chesterton-everlasting': 1925,
  'chesterton-heretics': 1905,
  'chesterton-innocencebrown': 1911,
  'chesterton-longbow': 1925,
  'chesterton-magic': 1913,
  'chesterton-manalive': 1912,
  'chesterton-napoleon': 1904,
  'chesterton-orthodoxy': 1908,
  'chesterton-thingsconsidered': 1908,
  'chesterton-thursday': 1908,
  'chesterton-toomuch': 1922,
  'chesterton-trifles': 1909,
  'chesterton-victorianage': 1913,
  'chesterton-whatwrong': 1910,
  'chesterton-whitehorse': 1911,
  'chesterton-wisdom': 1914,
};

export const ADR112_CUTOFF_YEAR = 1931;

/** Surname-rule hits a human has reviewed and cleared, keyed by the exact author string, value
 *  = who this actually is. The ONLY way out of a surname hit besides a ruling admission — and it
 *  is a record, not a judgement call inside the matcher. */
export const REVIEWED_SURNAME_CLEARANCES = {
  'Bayly, Lewis':
    'Lewis Bayly (d. 1631), bishop, author of The Practice of Piety — a different person from C. S. Lewis (d. 1963), public domain in fact. The only surname-token hit in the measured 1,212-file static corpus at the 2026-08-21 close-out; cleared then.',
};

/** Word-boundary token match, so 'lewis' hits "Lewis, Howell Elvet" but never "Lewisham". */
export function authorSurnameLooksMustNotServe(author) {
  if (typeof author !== 'string') return false;
  const tokens = new Set(author.toLowerCase().split(/[^a-z]+/).filter(Boolean));
  return MUST_NOT_SERVE_SURNAMES.some((s) => tokens.has(s));
}

export function isRulingAdmittedWorkSlug(slug) {
  const year = MUST_NOT_SERVE_WORK_EXCEPTIONS[slug];
  return year !== undefined && year < ADR112_CUTOFF_YEAR;
}

function walkJson(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkJson(p));
    else if (name.endsWith('.json') && name !== '_manifest.json') out.push(p);
  }
  return out;
}

/**
 * Scan every served commentary file and report what is deliverable by author.
 *
 * @param {string} dir  usually web/public/commentaries
 * @returns {{files:number, entries:number, offenders:Array<{author:string,entries:number,chars:number,kind:'must-not-serve'|'in-copyright',sample:string}>}}
 */
export function scanServedCorpusAuthors(dir) {
  const files = walkJson(dir);
  const byAuthor = new Map();
  let entries = 0;

  for (const f of files) {
    let doc;
    try {
      doc = JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      // A file we cannot parse is a file we cannot clear. Surfaced as its own offender rather
      // than skipped, because "unreadable" must never read as "clean".
      const k = '(unparseable file)';
      const rec = byAuthor.get(k) ?? { author: k, entries: 0, chars: 0, kind: 'must-not-serve', sample: f };
      rec.entries += 1;
      byAuthor.set(k, rec);
      continue;
    }
    for (const e of doc?.entries ?? []) {
      entries += 1;
      const author = typeof e?.author === 'string' ? e.author : '(no author)';
      const must = isMustNotServe(author);
      const suspect = IN_COPYRIGHT_SUSPECTS.includes(author);
      // The surname rule fires only where the exact/prefix rules did not, and the ONLY ways out
      // are recorded lists — an owner ruling admitting the work, or a reviewed clearance of the
      // person — never a judgement inside the matcher. Fail closed is the house posture on
      // licensing; a false positive costs a blocked deploy and a review, a miss costs delivery
      // of vetoed text as unauthenticated static JSON.
      const work = typeof e?.work === 'string' ? e.work : '';
      const surnameHit =
        !must &&
        authorSurnameLooksMustNotServe(author) &&
        !isRulingAdmittedWorkSlug(work) &&
        !(author in REVIEWED_SURNAME_CLEARANCES);
      if (!must && !suspect && !surnameHit) continue;
      const rec = byAuthor.get(author) ?? {
        author,
        entries: 0,
        chars: 0,
        kind: must || surnameHit ? 'must-not-serve' : 'in-copyright',
        sample: path.relative(process.cwd(), f),
      };
      rec.entries += 1;
      rec.chars += (e?.text ?? '').length;
      byAuthor.set(author, rec);
    }
  }

  const offenders = [...byAuthor.values()].sort((a, b) => b.entries - a.entries);
  return { files: files.length, entries, offenders };
}
