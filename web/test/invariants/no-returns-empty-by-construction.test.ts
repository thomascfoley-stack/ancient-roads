// A COMMENT THAT ASSERTS A DATA STATE IS A CLAIM, AND CLAIMS GO STALE.
//
// Two comments in the retrieval path said the historian lane "returns [] by construction" and
// that "no `historians` payload is attached". Both were true when written and both went false
// when the serve flip landed: 6,492 historian rows, all served, filter matches every one. They
// survived because nothing checks prose — and their effect was not cosmetic. They are the reason
// nobody looked at the lane, which is where B031 lives (92.4% of those rows carry no verse anchor
// and none fall in a typical query's band, so the on-range leg returns nothing and execution
// falls through to an unconstrained global top-3, with no relevance floor on any lane).
//
// This is the repo's instance-fifteen shape — a cited premise nothing re-checks — and the answer
// here is narrow on purpose. It does not try to police comments in general, which would just
// teach people to write vaguer ones. It bans ONE phrase pattern: a claim that a query path
// returns nothing "by construction", which is precisely the claim that stops a reader measuring.
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const TEACHER = path.join(__dirname, '..', '..', 'src', 'lib', 'teacher');

describe('no retrieval comment claims a lane is empty by construction', () => {
  it('the phrase does not appear anywhere in the teacher path', () => {
    // SEED: restore either original comment -> RED, naming the file.
    const hits = execSync(
      `grep -rniE "returns \\\\[\\\\] by construction|empty by construction|no .{0,20}payload is attached" "${TEACHER}" || true`,
      { encoding: 'utf8' },
    ).trim();
    expect(hits, `a comment asserts a data state the DB decides:\n${hits}`).toBe('');
  });

  it('the scan reaches real files (anti-vacuity)', () => {
    // Without this, a typo'd path makes the leg above pass forever.
    const files = execSync(`ls "${TEACHER}"/*.ts | wc -l`, { encoding: 'utf8' }).trim();
    expect(Number(files)).toBeGreaterThan(3);
  });
});
