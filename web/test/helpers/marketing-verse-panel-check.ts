// Marketing verse-panel demo sync — the check, in ONE place.
//
// The homepage's ten PUBLIC, attributed quotes (marketing/verse-panel-demo.tsx) are the
// product guarantee on its own front door: every excerpt must be a VERBATIM substring of
// a SERVED entry by that author on John 1:1, and every author must pass
// isPublishedCommentaryEntry. A fabricated or drifted quote there is a C1 breach.
//
// This check used to live ONLY in test/marketing-verse-panel-sync.test.ts, which is
// `describe.skipIf(corpus absent)` — right for CI, where the gitignored corpus cannot
// exist, and WRONG as the only enforcement: `vercel --prod` uploads the working
// directory, so the one moment the corpus is provably present and the quotes are about
// to ship is exactly when the guard was allowed to announce a skip. (The test's comment
// claimed the predeploy gate "hard-fails on the same tree" — it did not: the gate never
// ran vitest.) scripts/predeploy-gate.ts now imports THIS module and runs the same
// assertions with no artifact exemption, the same split as verse-key-scan.ts.
//
// The test and the gate share this module rather than each carrying a copy — a second
// implementation is how the two drift and the deploy-side one silently stops matching
// what CI believes it enforces.
import { existsSync, readFileSync } from 'node:fs';
import { isPublishedCommentaryEntry } from '../../src/lib/legal-corpus';

/** The demo's shape (marketing/verse-panel-demo.tsx VERSE_PANEL_VOICES). */
export interface MarketingVoice {
  readonly label: string;
  readonly author: string;
  readonly excerpt: string;
}

/** A static-corpus chapter entry, as far as this check reads it. */
export interface John1Entry {
  verseStart: number;
  verseEnd: number;
  author: string;
  sourceUrl?: string | null;
  work?: string | null;
  text: string;
}

/** The demo anchors on John 1:1; John is book 43. */
export const JOHN_BOOK = 43;
export const EXPECTED_VOICES = 10;

// Typographic normalization ONLY (curly vs straight quotes, whitespace runs). Words,
// order and punctuation marks all still have to match — this cannot paper over a
// paraphrase, which is the failure mode the check exists to catch.
export const normalizeTypography = (s: string): string =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** Entries covering John 1:1 from the chapter file, or null when the file is absent
 *  (gitignored corpus — the CALLER decides whether absence is a skip or a refusal). */
export function loadJohn1Entries(chapterFile: string): John1Entry[] | null {
  if (!existsSync(chapterFile)) return null;
  const parsed = JSON.parse(readFileSync(chapterFile, 'utf8')) as { entries: John1Entry[] };
  return parsed.entries.filter((e) => e.verseStart <= 1 && 1 <= e.verseEnd);
}

/**
 * The substantive check. Returns human-readable findings; [] = clean. Every leg can
 * fail — including the vacuity leg: an empty entry list would make the ten per-voice
 * legs unreachable-green, so it is a finding of its own.
 */
export function marketingVersePanelFindings(
  voices: readonly MarketingVoice[],
  john1Entries: readonly John1Entry[],
): string[] {
  const findings: string[] = [];
  if (voices.length !== EXPECTED_VOICES) {
    findings.push(`expected ${EXPECTED_VOICES} voices in VERSE_PANEL_VOICES, found ${voices.length}`);
  }
  if (new Set(voices.map((v) => v.author)).size !== voices.length) {
    findings.push('duplicate author in VERSE_PANEL_VOICES — the demo claims distinct voices');
  }
  if (john1Entries.length === 0) {
    findings.push('VACUOUS: no John 1:1 entries in the corpus file — nothing below could have failed');
    return findings;
  }
  for (const v of voices) {
    const own = john1Entries.filter((e) => e.author === v.author);
    if (own.length === 0) {
      findings.push(`${v.label}: no John 1:1 entries by "${v.author}"`);
      continue;
    }
    const served = own.filter((e) =>
      isPublishedCommentaryEntry({ author: e.author, sourceUrl: e.sourceUrl, book: JOHN_BOOK, work: e.work }),
    );
    if (served.length === 0) {
      findings.push(`${v.label}: "${v.author}" has John 1:1 entries but NONE are served (isPublishedCommentaryEntry)`);
      continue;
    }
    if (!served.some((e) => normalizeTypography(e.text).includes(normalizeTypography(v.excerpt)))) {
      findings.push(
        `${v.label}: excerpt is NOT a verbatim substring of any served John 1:1 entry by "${v.author}" — ` +
          `a fabricated or drifted quote on the public front door`,
      );
    }
  }
  return findings;
}
