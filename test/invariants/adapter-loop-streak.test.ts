// Red-proofs for the consecutive-failure streak reset (src/ingest/loop-breakers.ts
// `breakStreak` + src/ingest/adapter-loop.ts wiring). The loop pushes `recentCodes`
// on a known-code quarantine and must CLEAR it on every non-quarantine outcome
// (success, already-ingested skip, embed-429 deferral, unknown-code escalation,
// adapter-this-loop-doesn't-run) — otherwise scattered same-code quarantines read
// as "N in a row" through `checkBreakers` and HALT a healthy sweep. The existing
// loop-breakers.test.ts fixtures hand-build `recentCodes`, so they prove "the last
// 3 quarantine codes are identical -> HALT", not "the last 3 works failed"; these
// proofs drive the streak with the SAME primitives the loop uses (`push` on a
// quarantine, `breakStreak` on anything else) and then read it through
// `checkBreakers` — the interleaved path the unit fixtures cannot see. The wiring
// block pins that the loop calls `breakStreak` at every non-quarantine outcome.
// (THE_LOOP rule 4.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBreakers, breakStreak } from '../../src/ingest/loop-breakers.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// One work's outcome, the way the loop produces it: a known-code quarantine
// pushes its code; every other outcome breaks the streak. `replay` runs a whole
// sequence through those exact primitives and returns the resulting streak.
type Outcome = { kind: 'quarantine'; code: string } | { kind: 'other' };

const replay = (outcomes: readonly Outcome[]): string[] => {
  const recentCodes: string[] = [];
  for (const o of outcomes) {
    if (o.kind === 'quarantine') recentCodes.push(o.code);
    else breakStreak(recentCodes);
  }
  return recentCodes;
};

// `attempted` is set high and `quarantined` to the real quarantine count so the
// quarantine-rate breaker (>=minAttempts && quarantined/attempted > rate) stays
// quiet — the consecutive-failure breaker reads only `recentCodes`, so it is the
// only trip that can fire here. This mirrors the bug report's scenario (3/28
// quarantines ~= 11% < 30%, yet consecutive-failure HALTs by precedence).
const check = (recentCodes: string[], quarantined: number): ReturnType<typeof checkBreakers> =>
  checkBreakers({
    attempted: 100,
    quarantined,
    stagedThisRun: 0,
    recentCodes,
    elapsedMs: 0,
  });

// The exact scattered scenario from the bug report: 3 'fetch' quarantines
// separated by 25 successes. With the reset, only the trailing quarantine
// survives — successes broke the streak each time — so no HALT.
const scattered: Outcome[] = [
  { kind: 'quarantine', code: 'fetch' },
  ...Array.from({ length: 23 }, () => ({ kind: 'other' }) as Outcome),
  { kind: 'quarantine', code: 'fetch' },
  { kind: 'other' }, { kind: 'other' },
  { kind: 'quarantine', code: 'fetch' },
];

describe('consecutive-failure streak reset — scattered quarantines do not HALT', () => {
  it('the scattered scenario leaves a one-code streak and does NOT trip', () => {
    const rc = replay(scattered);
    expect(rc).toEqual(['fetch']);
    expect(check(rc, 3)).toBeNull();
  });
});

describe('breakStreak', () => {
  it('clears a non-empty streak in place, keeping the same array reference', () => {
    const rc = ['fetch', 'parse', 'fetch'];
    const ref = rc;
    breakStreak(rc);
    expect(rc).toEqual([]);
    expect(ref).toBe(rc); // the loop holds one recentCodes for the whole run
  });
  it('is a no-op on an already-empty streak', () => {
    const rc: string[] = [];
    breakStreak(rc);
    expect(rc).toEqual([]);
  });
});

describe('consecutive-failure still trips on a REAL streak (no false negatives)', () => {
  it('three same-code quarantines back-to-back STILL HALT', () => {
    const rc = replay(
      [
        ...Array.from({ length: 20 }, () => ({ kind: 'other' }) as Outcome), // pad the rate
        { kind: 'quarantine', code: 'fetch' },
        { kind: 'quarantine', code: 'fetch' },
        { kind: 'quarantine', code: 'fetch' },
      ],
    );
    expect(rc).toEqual(['fetch', 'fetch', 'fetch']);
    const t = check(rc, 3);
    expect(t?.breaker).toBe('consecutive-failure');
    expect(t?.action).toBe('halt');
  });

  it('a non-quarantine between two sub-limit pairs resets — 2 + break + 2 does NOT HALT', () => {
    const rc = replay(
      [
        ...Array.from({ length: 20 }, () => ({ kind: 'other' }) as Outcome),
        { kind: 'quarantine', code: 'fetch' },
        { kind: 'quarantine', code: 'fetch' },
        { kind: 'other' }, // success / skip / 429 / escalation breaks the streak
        { kind: 'quarantine', code: 'fetch' },
        { kind: 'quarantine', code: 'fetch' },
      ],
    );
    expect(rc).toEqual(['fetch', 'fetch']); // the break cleared the first pair
    expect(check(rc, 4)).toBeNull();
  });
});

describe('adapter-loop wiring — every non-quarantine outcome breaks the streak', () => {
  const src = readFileSync(path.join(REPO, 'src/ingest/adapter-loop.ts'), 'utf8');
  const lines = src.split('\n');
  const findIdx = (needle: string): number => {
    const i = lines.findIndex((l) => l.includes(needle));
    if (i < 0) throw new Error(`wiring anchor not found in adapter-loop.ts: ${needle}`);
    return i;
  };
  // true if `breakStreak(recentCodes)` sits within `window` lines (either side) of
  // the anchor — forgiving of incidental reformatting, but pins the call to the
  // right outcome branch. adapter-loop.ts has no `breakStreak` in comments, so
  // every hit is a real call site.
  const resetsNear = (anchor: string, window: number): boolean => {
    const i = findIdx(anchor);
    return lines
      .slice(Math.max(0, i - window), i + window + 1)
      .some((l) => l.includes('breakStreak(recentCodes)'));
  };

  it('imports breakStreak from ./loop-breakers.js', () => {
    const importLine = lines.find((l) => l.includes("from './loop-breakers.js'"));
    expect(importLine).toBeDefined();
    expect(importLine!).toMatch(/\bbreakStreak\b/);
  });

  it('breaks the streak on a successful banked (the core fix)', () => {
    expect(resetsNear('const banked =', 6)).toBe(true);
  });

  it('breaks the streak on an already-ingested (state === "done") skip', () => {
    expect(resetsNear("state === 'done'", 3)).toBe(true);
  });

  it('breaks the streak on an embed-429 deferral', () => {
    expect(resetsNear("code === 'embed-429'", 8)).toBe(true);
  });

  it('breaks the streak on an unknown-code escalation (failWork else of known)', () => {
    expect(resetsNear('recentCodes.push(code)', 3)).toBe(true);
  });

  it('breaks the streak on an adapter this loop does not run (the else branch)', () => {
    expect(resetsNear('not run by this loop', 4)).toBe(true);
  });

  it('a known-code quarantine still PUSHES (reset does not swallow the quarantine path)', () => {
    const pushLine = lines.find((l) => l.includes('recentCodes.push(code)'));
    expect(pushLine).toBeDefined();
  });
});
