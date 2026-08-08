// S2 item 1 — THE TRANSLATION PICKER EXPLAINS ITSELF.
//
// Exit test for `S2` item 1, written before the fix (§0.1).
//
// THE FINDING (both audits): all 18 translations are public domain — which is a genuine feature,
// since it is why this product can quote them freely and licensably. But a reader hunting for
// ESV / NIV / NLT finds them silently absent and reads that as a gap. One line converts a perceived
// defect into a stated position.
//
// The block calls this "free" and says do it first. The rendered check ("the translation picker
// explains itself") is BROWSER and stays unticked; this asserts the copy exists and says the two
// things that matter — that these are public domain, and that modern translations need licences.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const header = () => readFileSync(path.join(SRC, 'components/reader-header.tsx'), 'utf8');

describe('S2 item 1 — the translation picker states its position', () => {
  // SEED: delete the explainer line -> RED.
  it('explains why these translations and not the modern ones', () => {
    const code = header().replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code, 'the picker offers 18 translations and never says why ESV/NIV/NLT are absent')
      .toMatch(/public domain/i);
    expect(code, 'the copy must name the reason modern translations are missing — a licence — ' +
      'rather than leaving the reader to infer a gap').toMatch(/licen[cs]/i);
  });

  it('the explainer sits inside the picker, not somewhere else on the page', () => {
    // It must live in the dropdown that raises the question. A note elsewhere answers nobody.
    const code = header();
    const dropdown = /versionOpen && \(([\s\S]*?)\n\s*\)\}/.exec(code)?.[1] ?? '';
    expect(dropdown, 'the explainer is not inside the version dropdown').toMatch(/public domain/i);
  });
});
