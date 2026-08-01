// CORPUS IDENTITY (Work Order v2 Stage 3.1). What is actually about to ship, named.
//
// THE PROBLEM THIS EXISTS FOR. `web/public/commentaries/` is gitignored and has no build
// step: it is written by offline ingest scripts, lives only on the operator's machine, and
// `vercel --prod` uploads the working directory. So ~380MB of the product's actual content
// reaches production without passing through git, CI, or review. Git identifies the code
// that ships. NOTHING identifies the corpus that ships — two deploys from the same sha can
// carry different content, and the difference is invisible afterwards.
//
// A manifest fixes the identity: file count, per-work file counts, and a hash over the file
// inventory. The ratchet then answers the only question that matters at deploy time —
// "is this the corpus we counted, or less of it?" — because the failure that actually
// happens here is content going MISSING (a half-finished regeneration, an interrupted
// merge, a quarantine that took more than intended), and a missing work is invisible in a
// reader that simply renders whatever it finds.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Inventory the corpus at BOTH granularities that can go missing.
 *
 *   books — the on-disk layout: `<book>/<chapter>.json` (1ch, 1co, jhn…), and how many
 *           chapter files each holds. Catches an interrupted regeneration of a book.
 *   works — the COMMENTARY WORKS, keyed by author, with an entry count each. This is the
 *           granularity the reader actually exposes and the one the directory tree hides:
 *           every chapter file carries entries from many authors, so Calvin could vanish
 *           from the whole corpus without changing a single file count.
 *
 * Deliberately NOT hashing file CONTENTS. Hashing ~380MB on every pre-commit would make the
 * gate slow enough that someone turns it off, and drift *within* an entry is what the
 * licensing ratchet and the verse-key distribution gate already measure. This answers the
 * question those two cannot: is a whole work, book, or chapter simply gone?
 */
export function buildCorpusInventory(corpusDir) {
  if (!existsSync(corpusDir)) {
    return { present: false, fileCount: 0, entryCount: 0, books: {}, works: {}, corpusHash: null };
  }
  const books = {};
  const works = {};
  let fileCount = 0;
  let entryCount = 0;
  for (const book of readdirSync(corpusDir).sort()) {
    const bookPath = path.join(corpusDir, book);
    if (!statSync(bookPath).isDirectory()) continue;
    const files = readdirSync(bookPath)
      .filter((f) => f.endsWith('.json') && f !== '_manifest.json')
      .sort();
    books[book] = files.length;
    fileCount += files.length;
    for (const f of files) {
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(path.join(bookPath, f), 'utf8'));
      } catch {
        // An unparseable file counts as a file and contributes no works. It will show up as
        // an author losing entries, which is the refusal we want — not a silent zero.
        continue;
      }
      if (!parsed || !Array.isArray(parsed.entries)) continue;
      for (const e of parsed.entries) {
        const author = typeof e?.author === 'string' ? e.author : '(no author)';
        works[author] = (works[author] ?? 0) + 1;
        entryCount++;
      }
    }
  }
  // Hash the INVENTORY, not the bytes: books with file counts and works with entry counts,
  // in a stable order. Two corpora with the same totals but different composition — a book
  // traded for another, an author traded for another — hash differently.
  const payload = [
    ...Object.entries(books).map(([b, n]) => `book\t${b}\t${n}`),
    ...Object.entries(works)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([w, n]) => `work\t${w}\t${n}`),
  ].join('\n');
  const corpusHash = createHash('sha256').update(payload).digest('hex');
  return { present: true, fileCount, entryCount, books, works, corpusHash };
}

/** Manifest shape version. Bumped when the inventory's meaning changes, because a ratchet
 *  that silently compares different meanings reads a rename as total loss. */
export const MANIFEST_VERSION = 2;

export function buildCorpusManifest(corpusDir, { sha, ts = new Date().toISOString() } = {}) {
  const inv = buildCorpusInventory(corpusDir);
  return {
    version: MANIFEST_VERSION,
    sha: sha ?? null,
    ts,
    corpusHash: inv.corpusHash,
    fileCount: inv.fileCount,
    entryCount: inv.entryCount,
    bookCount: Object.keys(inv.books).length,
    workCount: Object.keys(inv.works).length,
    books: inv.books,
    works: inv.works,
  };
}

/**
 * The ratchet. Compares what is on disk NOW against the last committed manifest.
 *
 * FAIL-CLOSED IN BOTH DIRECTIONS OF IGNORANCE:
 *   - corpus absent            -> refuse (you cannot ship a reader with no content)
 *   - no previous manifest     -> refuse when deploying; there is nothing to ratchet against,
 *                                 and "no baseline" must never read as "no regression"
 *                                 (ADR-036: an empty baseline is valid, an ABSENT one is not)
 *   - manifest version unknown -> refuse; comparing two different meanings of "works"
 *                                 would read a shape change as total loss (or as no loss)
 *   - fewer files than before  -> refuse
 *   - a book/work present before and missing now -> refuse, naming it
 *   - a book/work smaller than before            -> refuse, naming it
 *
 * GROWTH IS FINE. New works, books and chapters are the normal case; this is a ratchet
 * against loss, not a freeze.
 */
export function evaluateCorpusRatchet(current, previous, { deploying = false } = {}) {
  const failures = [];
  const empty = { missingWorks: [], shrunkWorks: [], missingBooks: [], shrunkBooks: [] };

  if (!current.present && current.fileCount === 0) {
    failures.push('the static commentary corpus is ABSENT — refusing: the reader would ship with no content, or content is about to be uploaded that was never counted');
    return { ok: false, failures, ...empty };
  }

  if (!previous) {
    if (deploying) {
      failures.push('no committed corpus manifest to ratchet against — refusing to deploy. Run `node scripts/build-corpus-manifest.mjs` and commit the result; an ABSENT baseline is not a clean one');
    }
    return { ok: failures.length === 0, failures, ...empty, baselining: true };
  }

  if ((previous.version ?? 1) !== MANIFEST_VERSION) {
    failures.push(
      `the last committed manifest is version ${previous.version ?? 1}, this gate speaks version ${MANIFEST_VERSION} — refusing to compare. ` +
        'Its `works` mean something different, so a comparison would be fiction in one direction or the other. ' +
        'Re-run `node scripts/build-corpus-manifest.mjs` against a corpus you have inspected and commit the result.',
    );
    return { ok: false, failures, ...empty };
  }

  if (current.fileCount < previous.fileCount) {
    failures.push(`corpus file count DECREASED: ${previous.fileCount} → ${current.fileCount} (−${previous.fileCount - current.fileCount})`);
  }
  if ((current.entryCount ?? 0) < (previous.entryCount ?? 0)) {
    failures.push(`commentary entry count DECREASED: ${previous.entryCount} → ${current.entryCount} (−${previous.entryCount - current.entryCount})`);
  }

  // Same comparison at both granularities: presence first, then size.
  const compare = (label, prev, now) => {
    const missing = [];
    const shrunk = [];
    for (const [key, was] of Object.entries(prev ?? {})) {
      const n = now?.[key];
      if (n === undefined) missing.push(key);
      else if (n < was) shrunk.push({ work: key, was, now: n });
    }
    if (missing.length > 0) {
      failures.push(`${label}(s) present in the last manifest and MISSING now: ${missing.join(', ')}`);
    }
    for (const s of shrunk) {
      failures.push(`${label} '${s.work}' shrank: ${s.was} → ${s.now}`);
    }
    return { missing, shrunk };
  };

  const w = compare('work', previous.works, current.works);
  const b = compare('book', previous.books, current.books);

  return {
    ok: failures.length === 0,
    failures,
    missingWorks: w.missing,
    shrunkWorks: w.shrunk,
    missingBooks: b.missing,
    shrunkBooks: b.shrunk,
  };
}

/** The most recent committed manifest, or null. Newest by filename (sha+ts are in it). */
export function loadLatestManifest(dir, readJson) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => /^corpus-manifest-.*\.json$/.test(f))
    .sort();
  const latest = files[files.length - 1];
  return latest ? readJson(path.join(dir, latest)) : null;
}
