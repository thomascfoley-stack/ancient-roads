// @vitest-environment jsdom
//
// D36/D37/D38 (DEEP_SWEEP) — three controls whose only state cue was colour. A source check,
// named as one: rendering study-panel or the word-study page pulls in their whole data layer,
// and what these findings assert is the presence of an ARIA attribute, which the source shows
// exactly. The behavioural half is a BROWSER leg and is not claimed here.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

describe('toggles expose their state, not just a colour', () => {
  it('D36 word-study Greek/Hebrew', () => {
    expect(read('app/library/word-study/page.tsx')).toMatch(/aria-pressed=\{lang === l\}/);
  });

  it('D36 reader-settings Light/Dark', () => {
    const src = read('components/reader-settings.tsx');
    expect(src).toMatch(/aria-pressed=\{!dark\}/);
    expect(src).toMatch(/aria-pressed=\{dark\}/);
  });

  it('D37 StudyPanel tabs use the repo’s tablist convention', () => {
    const src = read('components/study-panel.tsx');
    expect(src).toMatch(/role="tablist"/);
    expect(src).toMatch(/role="tab"/);
    expect(src).toMatch(/aria-selected=\{tab === t\.id\}/);
  });

  it('D38 highlight swatches expose which colour is active', () => {
    expect(read('components/study-panel.tsx')).toMatch(/aria-pressed=\{annotation\.color === c\.id\}/);
  });
});
