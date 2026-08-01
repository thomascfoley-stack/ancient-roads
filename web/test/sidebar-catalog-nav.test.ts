// THE ELEVENTH INSTANCE — "a hand-maintained expected set that nothing enforces", found 2026-08-01
// by loading the page rather than by reading the code.
//
// The sidebar typed out three catalog links. `lib/catalog.ts` is the taxonomy. Adding the
// Historians catalog updated the taxonomy, the library hub, the fence, the search and the tests —
// and the shelf was unreachable from the shell, because the nav was a separate list that nothing
// compared against the first. Every existing test stayed green. It was visible in a screenshot and
// invisible to the suite, which is exactly the shape this repo keeps paying for.
//
// The remedy is derivation (the sidebar now maps CATALOG_IDS), and this is the check that keeps it
// derived. It reads the SOURCE rather than rendering the component: the assertion is about the
// absence of a hardcoded list, and a render test would pass just as happily against three typed
// links as against a map.
//
// HONEST LIMIT, and the guard for it: this is a source scan, so it is written to REFUSE rather
// than under-read. If it cannot find the file, or finds no catalog link expression at all, it
// fails — a scan that quietly matches nothing would report a passing nav for a sidebar that lost
// its links entirely.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOGS, CATALOG_IDS } from '@/lib/catalog-defs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIDEBAR = path.join(ROOT, 'src/components/sidebar.tsx');

function sidebarSource(): string {
  const src = readFileSync(SIDEBAR, 'utf8');
  // Refuse on an empty or missing read rather than proceeding to vacuous assertions.
  expect(src.length, 'sidebar.tsx is empty or unreadable — this scan cannot mean anything').toBeGreaterThan(500);
  return src;
}

describe('every catalog is reachable from the shell', () => {
  it('the sidebar derives its catalog links from CATALOG_IDS', () => {
    const src = sidebarSource();
    expect(
      /CATALOG_IDS\.map\(/.test(src),
      'the sidebar must map CATALOG_IDS — a typed list of links orphans the next catalog added',
    ).toBe(true);
  });

  it('no catalog id is hardcoded as its own /library/<id> link', () => {
    const src = sidebarSource();
    // The derived form builds hrefs as `/library/${id}`. A literal `/library/sermons` means
    // someone re-typed one, which is how the list drifts back apart one link at a time.
    for (const id of CATALOG_IDS) {
      expect(
        src.includes(`"/library/${id}"`) || src.includes(`'/library/${id}'`),
        `sidebar.tsx hardcodes a link to "${id}" — derive it from CATALOG_IDS instead`,
      ).toBe(false);
    }
  });

  it('the derived link expression is present and reaches the catalog labels', () => {
    const src = sidebarSource();
    // Positive control: prove the scan is looking at a file that really does build catalog links,
    // so "no hardcoded ids" cannot pass simply because the nav block was deleted.
    expect(src, 'sidebar must build hrefs from the catalog id').toContain('/library/${id}');
    expect(src, 'sidebar must label links from the catalog definitions').toContain('CATALOGS[id].label');
  });

  it('every catalog has a non-empty label to render', () => {
    // A derived link with an empty label is an invisible link — reachable in the DOM, useless to
    // a reader, and it would satisfy every assertion above.
    expect(CATALOG_IDS.length).toBeGreaterThan(0);
    for (const id of CATALOG_IDS) {
      expect(CATALOGS[id].label.trim().length, `catalog "${id}" has no label`).toBeGreaterThan(0);
    }
  });

  it('Historians specifically is reachable — the catalog that exposed this', () => {
    expect(CATALOG_IDS).toContain('historians');
    expect(CATALOGS.historians.label).toBe('Historians');
  });
});
