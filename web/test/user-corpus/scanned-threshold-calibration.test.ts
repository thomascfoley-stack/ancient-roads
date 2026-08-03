// CALIBRATION of MIN_CHARS_PER_PAGE against real documents.
//
// The threshold shipped as REASONING: set prose runs 1500-3000 characters a page, a scan yields
// ~0, so 100 sits an order of magnitude clear of both and there is almost nothing in the gap.
// Reasoning is not measurement, and the ADR-100 discipline that applies to the translation
// detector applies here too -- a pre-registered number has to meet real files before it is trusted.
//
// WHAT THIS MEASURES. Two populations, both run through the REAL extractor (parsePdf), never a
// stub, because the number the rule consumes is produced by pdfjs:
//   TEXT — ordinary PDFs as they occur in the wild
//   SCAN — the SAME documents rasterised to images and reassembled as image-only PDFs, so the
//          pages are real and only the text layer is gone. That is what a scanner produces, and
//          building them from the same source documents controls for page count and layout.
//
// PRIVACY. The corpora are whatever the operator points this at -- on the machine where it was
// first run, the operator's own business documents. It therefore reports DISTRIBUTIONS ONLY:
// never a filename, never an excerpt, never a per-document line that could identify anything.
// The committed evidence is aggregate for the same reason.
//
// RESULT (2026-08-03, n=120 text / 12 scan): scans measured 0.0 chars/page across the board; real
// prose measured p05=316, median=1351. Three text-population documents fell below the threshold
// and all three are scans rather than prose -- two at exactly 0 chars over 13 and 2 pages, and one
// at 74 chars/page (222 characters across 3 pages, roughly one line per page: a stamp, not text).
// Zero confirmed false positives, and the threshold sits in an empty band between 74 and 316.
//
// THE LIMITATION THAT SURVIVES THIS MEASUREMENT, and it is the interesting one. Rasterised scans
// yield EXACTLY zero, so this corpus does not sample the case the threshold actually exists for:
// a scan carrying stray text from a header stamp or page number. That case is represented by
// exactly ONE observation here (the 74 chars/page document), which does fall below 100 -- so this
// is evidence FOR the current value and against a much lower one, but it is a single observation.
// A threshold of 30 would have accepted that document as prose. Widening the scan population to
// real scanner output, rather than rasterisation, is what would close it properly.
//
// Skips VISIBLY without the corpora, so it can never be mistaken for a check that ran.
//
//   CALIBRATION_TEXT_DIR=… CALIBRATION_SCAN_DIR=… npx vitest run test/user-corpus/scanned-threshold-calibration.test.ts

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePdf } from '@/lib/user-corpus/parse-pdf';
import { MIN_CHARS_PER_PAGE, countExtractable } from '@/lib/user-corpus/parse';

const TEXT_DIR = process.env.CALIBRATION_TEXT_DIR;
const SCAN_DIR = process.env.CALIBRATION_SCAN_DIR;
const enabled = Boolean(TEXT_DIR && SCAN_DIR);

if (!enabled) {
  console.warn(
    '⚠ SKIPPED (visibly): scanned-threshold calibration needs CALIBRATION_TEXT_DIR and ' +
      'CALIBRATION_SCAN_DIR. The committed measurement is in docs/evidence/lane-b-slice1/.',
  );
}

interface Measured {
  pages: number;
  chars: number;
  perPage: number;
}

async function measureDir(dir: string, limit: number): Promise<Measured[]> {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).slice(0, limit);
  const out: Measured[] = [];
  for (const f of files) {
    try {
      const bytes = new Uint8Array(readFileSync(path.join(dir, f)));
      const { text, pages } = await parsePdf(bytes);
      if (pages === 0) continue;
      const chars = countExtractable(text);
      out.push({ pages, chars, perPage: chars / pages });
    } catch {
      // Unreadable/encrypted files are refused by the pipeline elsewhere; they are not part of
      // the threshold question and are excluded rather than counted as zero, which would bias
      // the text population downward and flatter the threshold.
    }
  }
  return out;
}

const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

describe.skipIf(!enabled)('MIN_CHARS_PER_PAGE, measured against real documents', () => {
  it('separates real text-layer PDFs from real scans', async () => {
    const text = await measureDir(TEXT_DIR!, 120);
    const scan = await measureDir(SCAN_DIR!, 40);

    // Preconditions: a separation claim over an empty population proves nothing.
    expect(text.length, 'precondition: need real text PDFs to measure').toBeGreaterThan(20);
    expect(scan.length, 'precondition: need real scans to measure').toBeGreaterThan(5);

    const textPer = text.map((m) => m.perPage);
    const scanPer = scan.map((m) => m.perPage);

    const report = [
      `TEXT  n=${text.length}  chars/page  min=${Math.min(...textPer).toFixed(1)}  p05=${pct(textPer, 5).toFixed(1)}` +
        `  median=${pct(textPer, 50).toFixed(1)}  p95=${pct(textPer, 95).toFixed(1)}  max=${Math.max(...textPer).toFixed(1)}`,
      `SCAN  n=${scan.length}  chars/page  min=${Math.min(...scanPer).toFixed(1)}  median=${pct(scanPer, 50).toFixed(1)}` +
        `  max=${Math.max(...scanPer).toFixed(1)}`,
      `THRESHOLD ${MIN_CHARS_PER_PAGE}`,
      `  scans at or above threshold (would be WRONGLY ACCEPTED): ${scanPer.filter((v) => v >= MIN_CHARS_PER_PAGE).length}/${scan.length}`,
      `  text below threshold (refused as needing OCR):           ${textPer.filter((v) => v < MIN_CHARS_PER_PAGE).length}/${text.length}`,
      // Splitting the below-threshold group is what turns this from a number into a finding. A
      // document at exactly 0 chars/page IS a scan -- one already sitting in the wild among
      // ordinary files -- so refusing it is the feature working, not a false positive. Only the
      // 0-to-threshold band would be evidence the threshold is set too high.
      `    of those, at exactly 0 chars/page (genuine scans in the wild): ${textPer.filter((v) => v === 0).length}`,
      `    of those, in the 0-to-${MIN_CHARS_PER_PAGE} band (would be the worrying ones): ${textPer.filter((v) => v > 0 && v < MIN_CHARS_PER_PAGE).length}`,
      `  observed GAP: highest scan ${Math.max(...scanPer).toFixed(1)} -> lowest non-zero text ` +
        `${Math.min(...textPer.filter((v) => v > 0)).toFixed(1)} chars/page`,
    ].join('\n');
    console.log(`\n${report}\n`);

    // THE LOAD-BEARING ASSERTION. A scan accepted as a document is the silent drop this whole
    // slice exists to refuse, so the false-accept rate must be zero, not merely low.
    const wronglyAccepted = scanPer.filter((v) => v >= MIN_CHARS_PER_PAGE).length;
    expect(wronglyAccepted, 'a scan accepted as a document is the silent drop §8 forbids').toBe(0);

    // The threshold must also sit well clear of the scans rather than just above them, or the
    // next slightly-noisier scanner crosses it.
    expect(Math.max(...scanPer)).toBeLessThan(MIN_CHARS_PER_PAGE / 2);

    // And it must not be eating real documents. This is a MEASUREMENT, not a bar to tune to:
    // documents genuinely below it are either scans already in the wild or the threshold is
    // wrong, and the printed report is what distinguishes those.
    const refusedText = textPer.filter((v) => v < MIN_CHARS_PER_PAGE).length;
    expect(refusedText / text.length).toBeLessThan(0.2);
  }, 300_000);
});
