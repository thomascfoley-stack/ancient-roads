// A FILE PRESENT IN THE WORKING TREE IS NOT A FILE THAT SHIPS.
//
// THE DEFECT THIS EXISTS FOR (2026-08-04). The verse-preview feature fetched
// `/bible/<translation>/<book>/<chapter>.json` — 7.6K per chapter instead of a 137K–264K whole
// book, which is the right call on the merits. Those files are in `web/public`, so it worked on
// every developer machine, passed its tests, built clean, and was broken for every user the
// instant it deployed: `web/.vercelignore` excludes `public/bible/*/*/` ON PURPOSE, because 21,402
// per-chapter files would blow Vercel's 15,000-file CLI limit. The paths exist on no deployment.
// Nothing in the repo could have caught it — `ls` says the file is there, and it is; it just never
// leaves this machine.
//
// So this derives the excluded set FROM `.vercelignore` and checks it against the asset URLs the
// client actually fetches. It is NOT a hand-typed list of forbidden paths: the failure mode this
// repo keeps paying for is a guard whose expected set is typed by the same hand that typed the
// thing it guards (MASTER.md failure-mode watchlist), and a copy of the ignore rules here would be
// exactly that. The ignore file is the authority; this reads it.
//
// RED-PROOF: point any fetch in src/ at `/bible/${t}/${slug}/${chapter}.json` and this fails
// naming that call site. Watched red on 2026-08-04 against the real defect.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Paths from import.meta.url, never process.cwd() — the qa gate runs from the repo root while a
// direct vitest run starts in web/ (house rule; other tests here went red on exactly that).
const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Directory-exclusion patterns under public/, as segment lists. `public/bible/*​/*​/` -> [bible,*,*] */
function excludedPublicDirs(): string[][] {
  const raw = readFileSync(path.join(WEB_ROOT, '.vercelignore'), 'utf8');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.startsWith('public/'))
    .map((l) => l.replace(/\/+$/, '').split('/').slice(1))
    .filter((segs) => segs.length > 0);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

interface FetchSite {
  file: string;
  url: string;
  /** `${...}` collapsed to `*`, so a template literal can be compared to a glob. */
  segments: string[];
}

/** Every root-relative URL passed to fetch() in the client source. */
function fetchedAssetUrls(): FetchSite[] {
  const sites: FetchSite[] = [];
  for (const file of sourceFiles(path.join(WEB_ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/fetch\(\s*[`'"](\/[^`'"]*)[`'"]/g)) {
      const url = m[1]!;
      const normalised = url.replace(/\$\{[^}]*\}/g, '*').replace(/^\//, '');
      sites.push({ file: path.relative(WEB_ROOT, file), url, segments: normalised.split('/') });
    }
  }
  return sites;
}

/** Does this asset live INSIDE an excluded directory? Strictly deeper than the pattern. */
function insideExcludedDir(assetSegments: string[], pattern: string[]): boolean {
  if (assetSegments.length <= pattern.length) return false;
  return pattern.every((p, i) => p === '*' || p === assetSegments[i]);
}

describe('client fetches only assets that survive the deploy', () => {
  it('the ignore file is readable and actually excludes something under public/', () => {
    // Guards the guard: if .vercelignore is renamed or stops excluding public paths, the check
    // below would silently pass over an empty pattern set and assert nothing.
    const patterns = excludedPublicDirs();
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('finds the fetch call sites it claims to scan', () => {
    // Same reason: a regex that matches nothing is a green test that checks nothing.
    const sites = fetchedAssetUrls();
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.some((s) => s.url.includes('/bible/'))).toBe(true);
  });

  it('no fetched asset path is excluded from the deploy', () => {
    const patterns = excludedPublicDirs();
    const offenders = fetchedAssetUrls()
      .filter((site) => patterns.some((p) => insideExcludedDir(site.segments, p)))
      .map((site) => `${site.file}: fetch("${site.url}")`);

    expect(
      offenders,
      `These fetch a path that web/.vercelignore keeps out of every deployment. They will work ` +
        `locally and 404 in production:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
