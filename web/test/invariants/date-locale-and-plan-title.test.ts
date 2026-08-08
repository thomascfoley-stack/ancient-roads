// L2c — PLAN NAMES ARE HUMAN, AND DATES DO NOT FOLLOW THE READER'S LOCALE.
//
// Exit test for block `L2c` of docs/UX_REMEDIATION.md. Written before the fix, per §0.1.
//
// THE TWO DEFECTS, both observed live on production 2026-08-07 (INSTR):
//
// 1. `POST /api/plans` returned `"title":"rom in 3 weeks"` — the internal book slug, lowercase.
//    A plan's name is a commitment device; it appears every day for weeks.
//
// 2. Dates rendered from the READER's locale. The audit deck screenshotted `8月8日周六` and
//    inferred a server-locale leak; v1.1 of the spec corrected that after direct testing — the
//    calls simply pass no locale, so they resolve against whatever runtime formats them. The
//    product is entirely English: an all-English UI with Chinese dates is not correct locale
//    behaviour, it is an inconsistent hybrid. It convinced a careful auditor it was a server bug.
//
// WHY A SOURCE SCAN AND NOT ONLY A BEHAVIOUR TEST. The third exit check is a grep by design: a
// behaviour test pins the call sites it happens to know about, and the defect is precisely a call
// site nobody thought about. Scanning the tree catches the next one too — which is the whole point,
// since `suggested-readings.tsx` was exactly that: a second unpinned site nobody had noticed.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultPlanTitle } from '@/lib/plan/title';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('L2c — plan titles are human-readable', () => {
  // SEED: return `spec.scope.book` instead of the display name -> RED.
  it('names a book plan by its display name, not its internal slug', () => {
    expect(defaultPlanTitle({ scope: { kind: 'book', book: 'rom' }, weeks: 3 })).toBe('Romans · 3 weeks');
  });

  it('uses the middot separator and singularises one week', () => {
    expect(defaultPlanTitle({ scope: { kind: 'book', book: 'jhn' }, weeks: 1 })).toBe('John · 1 week');
    expect(defaultPlanTitle({ scope: { kind: 'book', book: 'psa' }, weeks: 12 })).toBe('Psalms · 12 weeks');
  });

  it('falls back to the slug only when it is not a known book', () => {
    // Better an odd title than a crash or an empty one; the picker cannot produce this.
    expect(defaultPlanTitle({ scope: { kind: 'book', book: 'nope' }, weeks: 2 })).toBe('nope · 2 weeks');
  });

  it('leaves the other scopes alone', () => {
    expect(defaultPlanTitle({ scope: { kind: 'range', ref: 'Romans 8' }, weeks: 2 })).toBe('Romans 8 · 2 weeks');
    expect(defaultPlanTitle({ scope: { kind: 'topic', workSlug: 'x', sectionId: 1 }, weeks: 2 })).toBe('Topical plan');
  });
});

describe('L2c — no date formatting follows the reader locale', () => {
  // SEED: drop the locale argument from any date call in web/src -> RED, naming the file and line.
  //
  // This is the check the spec says is "expected to FAIL before the fix — that failure is the bug".
  //
  // SCOPE, NARROWED DELIBERATELY AND NOT TO MAKE IT PASS. The first version of this scanned
  // `toLocaleString` too and found NINE offenders. Only two are dates; the other 9 are
  // `.length.toLocaleString()` on counts. Fixing all nine would touch six files, past the spec's
  // ~3-file stop condition (§0.4), and L2c's own minimal change says "every other DATE-format
  // call". So the number sites are ratcheted below rather than fixed here or quietly dropped.
  const DATE_CALL = /\.toLocaleDateString\s*\(|\.toLocaleTimeString\s*\(|new Intl\.DateTimeFormat\s*\(/;

  it('every DATE-formatting call passes an explicit locale', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (!DATE_CALL.test(line)) return;
        const args = line.slice(line.indexOf('(', line.search(DATE_CALL)) + 1);
        if (!/^\s*(['"`]|DISPLAY_LOCALE\b)/.test(args)) offenders.push(`${path.relative(SRC, file)}:${i + 1}`);
      });
    }
    expect(
      offenders,
      "these format dates against the reader's locale — an all-English product must not render " +
        'Chinese dates. Pass DISPLAY_LOCALE (web/src/lib/locale.ts).',
    ).toEqual([]);
  });

  // A RATCHET, NOT AN ALLOWLIST. `n.toLocaleString()` on a count renders `1.234` on a German
  // browser and `1,234` here — the same inconsistency as the dates, smaller blast radius, and OUT
  // OF L2c's SCOPE (spec §0.4: more than ~3 files). Logged to the Backlog.
  //
  // The count is asserted rather than the sites listed, because a hand-maintained expected set is
  // this repo's most-punished defect (MASTER watchlist). This CAN fail — add a tenth and it goes
  // red — and it cannot silently absorb a new one.
  it('unpinned NUMBER formatting does not grow beyond the 9 already logged', () => {
    let count = 0;
    for (const file of walk(SRC)) {
      readFileSync(file, 'utf8').split('\n').forEach((line) => {
        const m = /\.toLocaleString\s*\(/.exec(line);
        if (!m) return;
        const args = line.slice(line.indexOf('(', m.index) + 1);
        if (!/^\s*(['"`]|DISPLAY_LOCALE\b)/.test(args)) count += (line.match(/\.toLocaleString\s*\(/g) ?? []).length;
      });
    }
    expect(count, 'a new unpinned toLocaleString appeared — pin it, do not raise this number').toBeLessThanOrEqual(9);
  });
});
