import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(__dirname, '..', 'src', 'bible');
const WEB_DIR = join(__dirname, '..', 'web', 'src', 'bible');

describe('src/bible ↔ web/src/bible sync guard', () => {
  const srcFiles = readdirSync(SRC_DIR).filter((f) => f.endsWith('.ts')).sort();
  const webFiles = readdirSync(WEB_DIR).filter((f) => f.endsWith('.ts')).sort();

  it('both directories contain the same set of files', () => {
    expect(webFiles).toEqual(srcFiles);
  });

  for (const file of srcFiles) {
    it(`${file} is byte-identical`, () => {
      const src = readFileSync(join(SRC_DIR, file), 'utf8');
      const web = readFileSync(join(WEB_DIR, file), 'utf8');
      expect(web).toBe(src);
    });
  }
});
