// WHERE EACH SOURCE'S BYTES ACTUALLY LIVE — one definition, imported by the adapters that fetch
// them and by the archiver that preserves them.
//
// WHY THIS FILE EXISTS. `provenance.url` in `ingest/sources.config.json` is a LANDING PAGE, not an
// artifact: `https://www.ccel.org/ccel/newton/olneyhymns` is a human-readable index, while the
// adapter actually fetches `https://www.ccel.org/ccel/newton/olneyhymns.xml`. An archiver written
// against `provenance.url` would faithfully store 24 CCEL index pages, report "archived", and
// preserve none of the text. That is worse than no archive, because it converts an open risk into
// a false sense of safety — so the artifact URLs live here, in ONE place, and the adapters import
// them rather than each carrying its own inline template literal to drift from.
//
// WHAT THIS FILE DELIBERATELY CANNOT DO. Two acquisition kinds have no URL anywhere in this repo,
// and this module reports them as unrecoverable rather than inventing something plausible:
//
//   * `sword` (5 works) — the adapters read an already-unpacked module directory under
//     `data/raw/sword/<Module>` (`sword-zverse.ts` usage line). Nothing records which CrossWire
//     .zip it came from, so a fresh machine cannot reconstruct it.
//   * entries with NO `provenance.acquire` block at all (14 works, including every commentary
//     currently published to production) — they predate the adapter contract.
//
// Reporting those honestly is the point of `artifactSourcesFor`. See docs for the coverage split.

/** CCEL serves the machine-readable text at `<id>.xml`; the bare path is the reading UI. */
export function ccelXmlUrl(ccelId) {
  return `https://www.ccel.org/ccel/${ccelId}.xml`;
}

/**
 * Expand a CCEL id pattern like `spurgeon/sermons{01..63}` into its 63 ids.
 *
 * Zero-padding is taken from the FIRST bound's width, so `{01..63}` yields `sermons01`, not
 * `sermons1`. This lived inline in `adapter-ccel.ts` and now lives here because the archiver needs
 * exactly the same expansion: two copies of "which 63 documents is this work" is how an archive
 * ends up preserving 62 of them and reporting success. The adapter imports this.
 *
 * Returns [] for anything that is not a brace range, so callers can distinguish "no pattern" from
 * "a pattern that expanded to nothing".
 */
export function expandCcelIdPattern(pattern) {
  if (typeof pattern !== 'string') return [];
  const m = pattern.match(/^(.*)\{(\d+)\.\.(\d+)\}(.*)$/);
  if (!m) return [];
  const [, pre, a, b, post] = m;
  const pad = a.length;
  const out = [];
  for (let i = Number(a); i <= Number(b); i++) out.push(`${pre}${String(i).padStart(pad, '0')}${post}`);
  return out;
}

/**
 * Project Gutenberg, in the adapter's own preference order: the generated cache first, the raw
 * files path second. BOTH are returned because PG serves one or the other depending on the title,
 * and the adapter already falls through — an archiver that only knew the first would record a
 * spurious failure for every ebook that only exists at the second.
 */
export function gutenbergTextUrls(ebookId) {
  return [
    `https://www.gutenberg.org/cache/epub/${ebookId}/pg${ebookId}.txt`,
    `https://www.gutenberg.org/files/${ebookId}/${ebookId}-0.txt`,
  ];
}

/** archive.org's OCR text derivative for a scanned item. */
export function archiveDjvuTextUrl(identifier) {
  return `https://archive.org/download/${identifier}/${identifier}_djvu.txt`;
}

/**
 * A GitHub raw file. `ref` MUST be a commit sha, never a branch name: a branch moves, and an
 * archive keyed to a moving reference cannot prove what it stored. Callers that hold only a branch
 * should resolve it to a sha before archiving.
 */
export function githubRawUrl(repo, ref, filePath) {
  return `https://raw.githubusercontent.com/${repo}/${ref}/${filePath}`;
}

/** One artifact to fetch: `urls` are alternatives tried in order, the first success wins. */
const artifact = (name, urls) => ({ name, urls: Array.isArray(urls) ? urls : [urls] });

/**
 * The artifacts for one manifest entry.
 *
 * Returns `{ ok: true, artifacts }` when the bytes are re-fetchable from a URL this repo can
 * derive, or `{ ok: false, reason }` when they are not. It NEVER falls back to `provenance.url`:
 * that is the failure this whole module exists to prevent.
 */
export function artifactSourcesFor(entry) {
  const prov = entry?.provenance ?? {};
  const acq = prov.acquire ?? null;

  if (!acq || typeof acq !== 'object' || !acq.adapter) {
    return {
      ok: false,
      kind: '(none)',
      reason:
        'no provenance.acquire block — this entry predates the adapter contract and records no ' +
        'machine-readable way to re-fetch it. Recovering it means re-establishing its source by hand.',
    };
  }

  switch (acq.adapter) {
    case 'ccel': {
      // Three id sources, in the adapter's own precedence: an explicit list, a brace range, or an
      // author page that must be crawled. Only the last needs the network to enumerate.
      let ids = Array.isArray(acq.ccel_ids) && acq.ccel_ids.length > 0 ? acq.ccel_ids : expandCcelIdPattern(acq.ccel_id_pattern);
      // A pattern that is not a brace range is a single literal id — the adapter's own fallback,
      // mirrored here so the two never disagree about how many documents a work has.
      if (ids.length === 0 && typeof acq.ccel_id_pattern === 'string' && acq.ccel_id_pattern !== '') {
        ids = [acq.ccel_id_pattern];
      }
      if (ids.length === 0) {
        if (acq.ccel_author) {
          return {
            ok: false,
            kind: 'ccel-author',
            reason:
              `id list is discovered by crawling https://www.ccel.org/ccel/${acq.ccel_author} ` +
              '(enumerateCcelAuthor). Recoverable, but the enumeration is a live fetch, so the id ' +
              'set is not derivable offline and is not pinned in the manifest — two archives taken ' +
              'a year apart could hold different works under the same slug.',
          };
        }
        return { ok: false, kind: 'ccel', reason: 'ccel adapter with no ccel_ids, no ccel_id_pattern and no ccel_author' };
      }
      return { ok: true, kind: 'ccel', artifacts: ids.map((id) => artifact(`${id.replace(/\//g, '_')}.xml`, ccelXmlUrl(id))) };
    }
    case 'gutenberg': {
      const out = [];
      if (acq.ebook_id != null) out.push(artifact(`pg${acq.ebook_id}.txt`, gutenbergTextUrls(acq.ebook_id)));
      // Some PG-sourced works were recovered from an archive.org scan instead; the manifest keeps
      // both keys and the adapter prefers whichever it was given.
      if (acq.archive_id) out.push(artifact(`${acq.archive_id}_djvu.txt`, archiveDjvuTextUrl(acq.archive_id)));
      if (out.length === 0) {
        return { ok: false, kind: 'gutenberg', reason: 'gutenberg adapter with neither ebook_id nor archive_id' };
      }
      return { ok: true, kind: 'gutenberg', artifacts: out };
    }
    case 'archive': {
      if (!acq.identifier) return { ok: false, kind: 'archive', reason: 'archive adapter with no identifier' };
      return { ok: true, kind: 'archive', artifacts: [artifact(`${acq.identifier}_djvu.txt`, archiveDjvuTextUrl(acq.identifier))] };
    }
    case 'github': {
      if (!acq.repo || !acq.path) return { ok: false, kind: 'github', reason: 'github adapter missing repo or path' };
      const ref = acq.commit ?? acq.ref ?? null;
      if (!ref) {
        return {
          ok: false,
          kind: 'github',
          reason:
            'github adapter pins no commit. A branch reference moves, so an archive taken against ' +
            'it cannot prove which bytes it stored. Pin `commit` in the manifest first.',
        };
      }
      return { ok: true, kind: 'github', artifacts: [artifact(acq.path.split('/').pop(), githubRawUrl(acq.repo, ref, acq.path))] };
    }
    case 'helloao': {
      if (!acq.api || !acq.commentary_id) {
        return { ok: false, kind: 'helloao', reason: 'helloao adapter missing api or commentary_id' };
      }
      // Per-chapter JSON over ~1,189 chapters. Enumerating them needs the book map the adapter
      // owns, so the archiver drives the adapter's own cache rather than re-deriving the walk here.
      return {
        ok: false,
        kind: 'helloao',
        reason:
          'API-paginated per chapter; the enumeration lives in adapter-helloao.ts (data/raw/helloao). ' +
          'Archive by running that adapter with its cache pointed at the archive root, not by URL derivation.',
      };
    }
    case 'sword': {
      return {
        ok: false,
        kind: 'sword',
        reason:
          `SWORD module "${acq.module ?? '(unnamed)'}" is read from an already-unpacked directory ` +
          '(data/raw/sword/<Module>). No CrossWire download URL is recorded anywhere in this repo, ' +
          'so a fresh machine cannot reconstruct it. Record the module .zip URL in the manifest to fix.',
      };
    }
    case 'topical-index': {
      // DERIVABLE, unlike the `sword` adapter above, and for exactly the reason that one is
      // refused: these entries record where the bytes came from. A CrossWire module resolves
      // to its published rawzip URL; OpenBible records its dump URL literally. Both are
      // already archived under data/raw/topical with sha256s in CHECKSUMS.sha256, so a fresh
      // machine can re-fetch and prove it got the same bytes.
      if (acq.dump) return { ok: true, kind: 'topical-index', artifacts: [artifact(acq.dump.split('/').pop(), acq.dump)] };
      if (acq.module) {
        const url = `https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/${acq.module}.zip`;
        return { ok: true, kind: 'topical-index', artifacts: [artifact(`${acq.module}.zip`, url)] };
      }
      return {
        ok: false,
        kind: 'topical-index',
        reason: 'topical-index adapter needs either `module` (a CrossWire module name) or `dump` (a literal artifact URL).',
      };
    }
    default:
      return { ok: false, kind: String(acq.adapter), reason: `unknown acquire adapter "${acq.adapter}"` };
  }
}

/** Every adapter kind `artifactSourcesFor` can derive URLs for. Used by the coverage test. */
export const DERIVABLE_ADAPTERS = ['ccel', 'gutenberg', 'archive', 'github', 'topical-index'];
