// THE .DOCX TEXT EXTRACTOR MUST BE LINEAR IN ITS INPUT — pre-deploy audit A1-1 (CRITICAL).
//
// THE DEFECT. Three of the four regexes in `xmlToText` had the shape
//   <w:tag  +  [^>]*  +  a required terminator
// On input where the terminator never arrives, the engine retries every prefix from every start
// offset — clean quadratic. Measured 2026-08-07 against the verbatim regexes:
//
//     payload   <w:tab pass
//      16 KB       23 ms
//      32 KB       92 ms
//      64 KB      356 ms      (4x input -> 15.5x time)
//
// and end-to-end through the real parseDocx, a 512 KB document.xml — a 919-BYTE UPLOAD after
// compression — burned 46 seconds of CPU and extracted zero characters.
//
// WHY THE EXISTING CAPS DO NOT HELP. MAX_DECOMPRESSED_BYTES is 80 MB, three orders of magnitude
// above the payload needed, so the zip-bomb cap authorises this rather than bounding it. The upload
// route has no rate limit, the work runs inside `after()` past the 201, and MAX_ATTEMPTS = 3
// re-serves the same payload three times.
//
// THE FIX. `[^>]*` -> `[^<>]*`. An XML attribute value cannot contain a raw `<` (it must be `&lt;`),
// so this is semantically identical on well-formed input — but it bounds each start position's scan
// to the distance to the next `<`, which makes the total linear.
//
// WHY THIS TEST IS TIMED RATHER THAN STRUCTURAL. Asserting "the source contains no [^>]*" would be
// a grep, and would pass the moment someone writes the same defect a different way. This measures
// the property itself. The bound is deliberately ~100x looser than a linear pass needs, so it is
// robust on a loaded CI box while still failing the pre-fix code by a wide margin (1.4 s vs 500 ms
// at 128 KB, and the gap widens with size).

import { describe, expect, it } from 'vitest';
import { xmlToTextForTest } from '@/lib/user-corpus/parse-docx';

// Adversarial: many match-start positions, terminator never arrives. This is the shape that makes
// it quadratic — a single unterminated tag is only linear.
const hostile = (unit: string, kb: number) => unit.repeat(Math.floor((kb * 1024) / unit.length));

describe('docx text extraction is linear in its input', () => {
  // SEED: revert any [^<>]* back to [^>]* in parse-docx.ts -> RED (each was 1.4s+ at 128 KB).
  for (const unit of ['<w:tab ', '<w:br ', '<w:t ']) {
    it(`survives 128 KB of unterminated \`${unit.trim()}\` tags`, () => {
      const payload = hostile(unit, 128);
      const started = Date.now();
      xmlToTextForTest(payload);
      const ms = Date.now() - started;
      expect(ms, `${unit.trim()} pass took ${ms}ms on 128 KB — quadratic backtracking is back`).toBeLessThan(500);
    });
  }

  it('does not degrade super-linearly as the payload doubles', () => {
    // The absolute bound above catches a gross regression; this catches a subtle one. Quadratic
    // shows as ~4x per doubling. Linear shows as ~2x. The 8x gate sits between them with room for
    // timer noise on a small sample.
    const timed = (kb: number) => {
      const payload = hostile('<w:tab ', kb);
      const started = Date.now();
      xmlToTextForTest(payload);
      return Math.max(Date.now() - started, 1); // floor at 1ms so the ratio stays meaningful
    };
    timed(64); // warm the JIT so the first sample is not the slow one
    const small = timed(64);
    const large = timed(256); // 4x the input
    expect(large / small, `4x the input cost ${(large / small).toFixed(1)}x the time`).toBeLessThan(8);
  });

  it('still extracts the same text from a well-formed document', () => {
    // The narrowing must not change behaviour on real input — this is what lets the test fail in
    // the other direction, if the fix were made by breaking extraction.
    const xml =
      '<w:p><w:r><w:t>In the beginning</w:t></w:r><w:tab/><w:r><w:t xml:space="preserve"> was the Word</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>And the Word</w:t></w:r><w:br/><w:r><w:t>was with God</w:t></w:r></w:p>';
    const out = xmlToTextForTest(xml);
    expect(out).toContain('In the beginning');
    expect(out).toContain('was the Word');
    expect(out).toContain('And the Word');
    expect(out).toContain('was with God');
    // The tab and the break must still separate tokens — the whole reason the alternation carries
    // both separators (see the comment at the call site).
    expect(out).not.toContain('beginningwas');
    expect(out).not.toContain('Wordwas');
  });
});
