// N4 — CLOSE ONE FAKE DOOR, REPURPOSE THE OTHER.
//
// Exit tests for block `N4`, written before the change. `PR1a` shipped the prayer journal, so the
// block's sequencing question ("either N4 waits for PR1a, or it ships a client-side carry-forward")
// is resolved the first way: the destination now exists, and PR1a's carry-forward already migrates
// the objects.
//
// THE DEFECT. UI for unshipped features was left enabled rather than gated. `+` beside CHANNELS
// opened a bare name field, creating one succeeded, and the reader landed on a placeholder saying
// the feature "is being built". Study Partners and `New section` behaved identically.
//
// THE DISPOSITIONS, from the block and its 2026-08-08 rulings:
//   1. CHANNELS  -> PRAYER JOURNAL, linking to the shipped PR1a surface.
//   2. STUDY PARTNERS -> hidden. The concept is retired, not deferred.
//   3. `New section` -> removed; it has no referent once sections are gone.
//   4. /channel/[id] -> REDIRECT to the prayers surface, never a placeholder. A 404 on a URL the
//      reader was invited to create is a dead end they cannot act on.
//
// The block's fourth exit check allows exactly two states for the sidebar section — the shipped
// journal, or hidden — and calls out "No third state". A "Coming soon" badge would be a second
// fake door, which is what this block exists to remove.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');
/** Comments stripped — and NOT with /\/\/.*$/gm, which eats the `//` in any URL (F1-fonts). */
const code = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('N4 — the retired concepts are gone from the sidebar', () => {
  const sidebar = () => code('components/sidebar.tsx');

  // SEED: restore `{ id: 'partners', kind: 'group', name: 'Study Partners', items: [] }` to
  // SEED_SECTIONS -> RED. That is the fake door itself.
  it('Study Partners is not seeded into any reader\'s sidebar', () => {
    expect(
      sidebar(),
      'Study Partners is retired, not deferred — a fresh account must never see it',
    ).not.toMatch(/Study Partners/);
  });

  // SEED: restore the `New section` button -> RED.
  it('the `New section` control is gone', () => {
    expect(
      sidebar(),
      '`New section` has no referent once user-defined sections are gone, and the walkthrough ' +
        'already flagged that it gives no clue which section it adds to',
    ).not.toMatch(/New section/);
  });

  it('nothing in the sidebar is badged as coming soon', () => {
    // The block: "Do not badge anything Coming soon. Between this block and PR1a, the section is
    // simply not there." PR1a shipped, so the section is real — a badge now would be worse.
    expect(sidebar()).not.toMatch(/Coming soon|coming soon|being built/);
  });
});

describe('N4 — CHANNELS is repurposed to the shipped prayer journal', () => {
  // SEED: point the link at `/channel` or drop it -> RED.
  it('the sidebar links to the shipped /prayers surface', () => {
    expect(
      code('components/sidebar.tsx'),
      'the section must show the SHIPPED journal or be hidden — the block allows no third state',
    ).toMatch(/href="\/prayers"/);
  });

  it('it is labelled Prayer journal, per the §2 naming lock', () => {
    // Amended 2026-08-08: the label is PRAYER JOURNAL, not PRAYERS. The rename sweep already
    // landed, and §2 says naming is not to be re-litigated.
    expect(read('components/sidebar.tsx')).toMatch(/Prayer journal/i);
  });
});

describe('N4 — the old channel route redirects, and never renders a placeholder', () => {
  const ROUTE = 'app/channel/[id]/page.tsx';

  it('the route still exists — a bare 404 was ruled against', () => {
    // RULED 2026-08-08: redirect, not 404. Deleting the route would produce the 404 the ruling
    // rejected, so its absence is a failure, not a pass.
    expect(
      existsSync(path.join(SRC, ROUTE)),
      'the channel route was deleted — that yields the 404 the owner ruled against, not a redirect',
    ).toBe(true);
  });

  // SEED: replace the redirect with the old placeholder component -> RED.
  it('it redirects to the prayers surface and renders no placeholder', () => {
    const route = code(ROUTE);
    expect(route, 'the route must redirect').toMatch(/redirect\(/);
    expect(route, 'it must land on the surface the concept moved to').toMatch(/'\/prayers'/);
    expect(
      route,
      'a placeholder is the fake door this block exists to close',
    ).not.toMatch(/ComingSoon|being built|placeholder/i);
  });
});
