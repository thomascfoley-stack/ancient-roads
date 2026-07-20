// LENS 2 adversarial probes (read-only). Each assertion below is written so it CAN fail.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { voicesForPassage } from '@/lib/today';
import { registerLane, partitionByRegister, isLaneWork } from '@/components/commentary-panel';
import type { CommentaryEntry } from '@/lib/bible';

const DIR = '/Users/tfoley/theology-study-app/web/public/commentaries';

function loadAll(): { file: string; entries: CommentaryEntry[]; book: number }[] {
  const out: { file: string; entries: CommentaryEntry[]; book: number }[] = [];
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, '_manifest.json'), 'utf8'));
  void manifest;
  for (const d of fs.readdirSync(DIR)) {
    const p = path.join(DIR, d);
    if (!fs.statSync(p).isDirectory()) continue;
    for (const f of fs.readdirSync(p)) {
      if (!f.endsWith('.json')) continue;
      const j = JSON.parse(fs.readFileSync(path.join(p, f), 'utf8'));
      if (!j.entries) continue;
      out.push({ file: `${d}/${f}`, entries: j.entries, book: j.book });
    }
  }
  return out;
}

describe('LENS2 P1 — registerLane historian reachability', () => {
  it('historian is NOT a register value anywhere in the served static corpus', () => {
    const seen = new Set<string>();
    for (const { entries } of loadAll()) for (const e of entries) if (e.register) seen.add(e.register);
    // would fail if any chapter file carried register='historian'
    expect([...seen].sort()).not.toContain('historian');
    console.log('REGISTER VALUES IN STATIC CORPUS:', [...seen].sort().join(', ') || '(none)');
  });
  it('registerLane maps an explicit historian register to EXEGETICAL (latent hole)', () => {
    // This is the latent defect, proven directly on the shipped function.
    expect(registerLane({ register: 'historian' })).toBe('exegetical');
    expect(isLaneWork({ register: 'historian' })).toBe(false);
    expect(partitionByRegister([{ register: 'historian' }]).exegetical).toHaveLength(1);
  });
  it('registerLane maps embeddings-vocabulary "prose" to EXEGETICAL too', () => {
    expect(registerLane({ register: 'prose' })).toBe('exegetical');
  });
});

describe('LENS2 P2 — the >=2 DISTINCT voices floor', () => {
  it('every non-empty Today voice set has >=2 DISTINCT authors', () => {
    const bad: string[] = [];
    let checked = 0;
    for (const { file, entries, book } of loadAll()) {
      const verses = new Set(entries.map((e) => e.verseStart));
      for (const v of verses) {
        const passage = { start: book * 1000000 + 1 * 1000 + v, end: book * 1000000 + 1 * 1000 + v };
        // reconstruct the chapter number from the filename
        const ch = Number(file.split('/')[1]!.replace('.json', ''));
        const p2 = { start: book * 1000000 + ch * 1000 + v, end: book * 1000000 + ch * 1000 + v };
        void passage;
        const { voices, rung } = voicesForPassage(p2 as never, entries, book);
        if (voices.length === 0) continue;
        checked++;
        const distinct = new Set(voices.map((x) => x.author));
        if (distinct.size < 2) bad.push(`${file} v${v} rung=${rung} voices=${voices.length} authors=${[...distinct].join('|')}`);
      }
    }
    const byRung: Record<string, number> = {};
    for (const b of bad) { const r = /rung=(\w+)/.exec(b)![1]!; byRung[r] = (byRung[r] ?? 0) + 1; }
    console.log(`CHECKED ${checked} non-empty voice sets; ${bad.length} with <2 distinct authors`);
    console.log('BY RUNG:', JSON.stringify(byRung));
    console.log('SAMPLE:', bad.slice(0, 6).join(' || '));
    const verseRung = bad.filter((b) => b.includes('rung=verse'));
    console.log('VERSE-RUNG SINGLE-AUTHOR SAMPLE:', verseRung.slice(0, 6).join(' || '));
    expect({ total: bad.length, verseRung: verseRung.length }).toEqual({ total: 0, verseRung: 0 });
  });

  it('lane content (sermon/theology/hymn) can never satisfy the floor', () => {
    const lane: CommentaryEntry[] = ['sermon', 'theology', 'confession', 'hymn', 'poetry'].map((r, i) => ({
      author: `Lane ${i}`, year: 1800, tradition: 'reformed', text: 'x', verseStart: 1, verseEnd: 1,
      sourceTitle: 't', sourceUrl: 'u', register: r,
    } as unknown as CommentaryEntry));
    const { voices, rung } = voicesForPassage({ start: 1001001, end: 1001001 } as never, lane, 1);
    expect(voices).toHaveLength(0);
    expect(rung).toBe('lead-only');
  });
});
