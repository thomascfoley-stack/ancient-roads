// adapter-beza-tcp.ts unit checks — TEI structure fails closed, heads split
// into articles with group-head prefixes, and typography normalization is exact.
import { describe, it, expect } from 'vitest';
import { parseBeza } from '../src/ingest/adapter-beza-tcp.js';

function tei(subsectionHeads: number, opts: { treatiseHeads?: number; conclusion?: boolean } = {}): string {
  const tHeads = opts.treatiseHeads ?? 45;
  let t1 = '<div type="treatise">';
  for (let i = 0; i < tHeads; i++) {
    t1 += `<head>${i === 0 ? 'Of the trinitie. The firſt point.' : `Article ${i}. Of ſome doctrine.`}</head><p>${'Body text of the article with plenty of words. '.repeat(6)}</p>`;
  }
  t1 += '</div>';
  let subs = '';
  for (let i = 0; i < subsectionHeads; i++) {
    subs += `<div type="subsection"><head>Topic ${i}.</head><p>${'Confutation body text here. '.repeat(8)}</p></div>`;
  }
  const concl = (opts.conclusion ?? true) ? `<div type="conclusion"><head>The concluſion.</head><p>${'Final words of the work. '.repeat(6)}</p></div>` : '';
  const t2 = `<div type="treatise"><head>Another briefe confeſsion.</head><p>${'Second treatise body. '.repeat(10)}</p></div>`;
  return `<TEI><teiHeader/><body><div type="title_page"><head>t</head></div>${t1}${subs}${concl}${t2}</body></TEI>`;
}

describe('parseBeza', () => {
  it('splits heads into sections, prefixes group heads, normalizes long-s', () => {
    // 45 treatise heads + 15 subsections + conclusion + treatise2 = 18 divs
    const recs = parseBeza(tei(15));
    expect(recs.length).toBeGreaterThanOrEqual(60);
    expect(recs.some((r) => r.key.includes('Of the trinitie. The first point.'))).toBe(true);
    expect(JSON.stringify(recs)).not.toContain('ſ');
    expect(recs[recs.length - 1]!.key).toContain('Another briefe confession.');
  });

  it('rejoins EOL-hyphenated words and keeps note inner text', () => {
    const xml = tei(15).replace('Body text of the article', 'pith<g ref="char:EOLhyphen"/>thie text <note>Rom. 1.</note>of the article');
    const recs = parseBeza(xml);
    expect(recs[0]!.text).toContain('piththie');
    expect(recs[0]!.text).toContain('Rom. 1.');
  });

  it('marks gaps as lacunae, never guesses', () => {
    const xml = tei(15).replace('plenty of words', 'plenty <gap reason="illegible"/> words');
    expect(parseBeza(xml)[0]!.text).toContain('⟨…⟩');
  });

  it('fails closed on a wrong div count', () => {
    expect(() => parseBeza(tei(10))).toThrow(/FAIL CLOSED/);
  });

  it('fails closed when there is no body', () => {
    expect(() => parseBeza('<TEI/>')).toThrow(/FAIL CLOSED/);
  });
});
