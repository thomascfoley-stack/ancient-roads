// Removes commentary "entries" whose `author` is actually a Bible cross-reference
// (e.g. "2 Corinthians  6:14-18"). These came from the HCF import, which stored
// cross-reference passages with the reference string in the author field. They
// are Scripture text, not commentary, and must not appear as a cited voice.
//
// Rule (per spec): remove any entry where author contains a double space "  "
// AND a colon ":". Real author names contain neither together.
//
// Idempotent + re-runnable. Reports files touched and entries removed.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = 'web/public/commentaries';

function isCrossRef(author: string): boolean {
  return author.includes('  ') && author.includes(':');
}

function* walkJson(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walkJson(p);
    else if (name.endsWith('.json')) yield p;
  }
}

let filesTouched = 0;
let entriesRemoved = 0;
const removedAuthors = new Set<string>();

for (const file of walkJson(ROOT)) {
  const data = JSON.parse(readFileSync(file, 'utf-8')) as {
    book: number;
    chapter: number;
    entries: { author: string }[];
  };
  if (!Array.isArray(data.entries)) continue;

  const before = data.entries.length;
  data.entries = data.entries.filter((e) => {
    if (isCrossRef(e.author)) {
      removedAuthors.add(e.author.trim());
      return false;
    }
    return true;
  });
  const removed = before - data.entries.length;

  if (removed > 0) {
    writeFileSync(file, JSON.stringify(data));
    filesTouched++;
    entriesRemoved += removed;
  }
}

console.log(`Files rewritten:   ${filesTouched}`);
console.log(`Entries removed:   ${entriesRemoved}`);
console.log(`Distinct bad authors removed: ${removedAuthors.size}`);
