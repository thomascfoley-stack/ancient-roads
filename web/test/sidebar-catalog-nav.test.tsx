// @vitest-environment jsdom
//
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
// WHERE THE FIRST VERSION OF THIS FILE WAS WRONG (2026-08-02 audit). The paragraph above claimed
// the scan "REFUSES rather than under-reads" and "fails if it finds no catalog link expression at
// all". It did not. Every one of its assertions was satisfied by TEXT, and JSX comments are text:
// an auditor wrapped the whole `CATALOG_IDS.map(...)` block in `{/* ... */}` — a sidebar rendering
// zero catalog links — and all five cases passed. The positive control was reading its own
// evidence out of the comment that disabled the thing it was controlling for.
//
// Note that importing `codeOnly` from scripts/lib/source-scan.mjs, the sibling fix used by
// ask-max-duration-literal.test.ts, would NOT have closed this: its comment regex does not match a
// line beginning `{/*`. The defect is not which stripper is used. It is that a source scan cannot
// answer "does this render a link", because the question is about the DOM, not the text.
//
// So the file now does both, and they answer different questions:
//   * RENDER the sidebar and assert one anchor per catalog — "is the shelf reachable". This is the
//     assertion that goes red when the block is commented out, deleted, or conditioned away.
//   * SCAN the source for the derived form — "will the NEXT catalog be reachable". A render test
//     alone would pass against four typed links and orphan the fifth, which is the original defect.
// The render half is load-bearing; the scan half is the ratchet.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { CATALOGS, CATALOG_IDS } from '@/lib/catalog-defs';

// The two things the shell needs from outside itself. Neither is the subject here: the nav must
// render its catalog links for a signed-out visitor on any route, so both are stubbed at their
// least interesting value rather than exercised.
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

// jsdom implements MutationObserver but NOT ResizeObserver, and the rail's `useMoreBelow` (which
// decides whether the "there is more below" fade is on) constructs one on mount. Without this the
// effect throws and the render half of this file — the load-bearing half, per the header — goes
// red for a reason that has nothing to do with catalog links.
//
// Stubbed HERE rather than guarded in sidebar.tsx with a `typeof ResizeObserver !== 'undefined'`:
// the gap is in this test environment, not in the product, and every browser the app supports has
// had ResizeObserver for years. A guard in the component would make the shipped code carry a
// branch that only ever runs in jsdom — and would silently disable the fade if it ever ran in a
// real browser that lacked it, which is the failure mode you least want to hide.
//
// It observes nothing: this file asserts on the rendered anchors, not on scroll behaviour. A stub
// that pretended to measure would be a mock asserting what it was told.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', NoopResizeObserver);

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

// ── the half that is about the DOM ───────────────────────────────────────────────────────────
describe('the sidebar actually RENDERS a link to every catalog', () => {
  it('one anchor per catalog, with its label — commenting the block out goes red here', async () => {
    // SEED: wrap the CATALOG_IDS.map block in {/* ... */} → RED here, green in every scan above.
    // That divergence is the whole reason this block exists.
    const { render } = await import('@testing-library/react');
    const { SidebarNavContent } = await import('@/components/sidebar');
    const { container } = render(<SidebarNavContent />);

    const hrefs = new Map(
      [...container.querySelectorAll('a')].map((a) => [a.getAttribute('href') ?? '', (a.textContent ?? '').trim()]),
    );
    for (const id of CATALOG_IDS) {
      const href = `/library/${id}`;
      expect(hrefs.has(href), `no sidebar link to ${href} — the ${id} shelf is unreachable from the shell`).toBe(true);
      expect(hrefs.get(href), `the ${id} link renders no label`).toContain(CATALOGS[id].label);
    }
  });
});
