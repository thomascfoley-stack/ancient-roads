// @vitest-environment jsdom
//
// THE 44px FLOOR, ON THE SURFACES THAT WERE UNDER IT.
//
// The house minimum is 44px of TARGET — the number `ask-scope-row.tsx` writes down in its own
// comment ("the text is the control, the padding is the target") and the number every reader
// header button already carries. Three surfaces shipped below it:
//
//   * history-results.tsx — the filter chips are `min-h-[30px]`, the copy-citation button is
//     `h-8 w-8` (32px), and "Show all N in this work" declared no height at all, so it was the
//     bare line-box of a 14px line.
//   * marketing/footer.tsx — five column links at `min-h-[40px]`.
//   * marketing/verse-panel-demo.tsx — ten voice tabs at `min-h-[40px]`.
//
// WHAT THIS FILE CAN SEE, AND WHAT IT CANNOT. jsdom has no layout engine: `getBoundingClientRect`
// returns zeros for everything, so a test cannot measure a rendered target here and one that
// claimed to would be measuring nothing. What it CAN do is read the height utility off the
// element that actually receives the click — and that utility IS the mechanism, not a proxy for
// it. So the assertion is: every named control carries an explicit base-width height utility of
// at least 44px. A control with no height utility at all FAILS, which is the point: 44px has to
// be declared, never inherited from whatever the font metrics happen to give.
//
// Responsive variants are deliberately ignored. `sm:min-h-0` on a header button is the desktop
// relaxation of a rule that exists for thumbs, and the base (mobile) value is the one under test.
//
// THE VISUAL CHIP IS NOT THE TARGET. history-results keeps its 30px bordered chip and its 32px
// copy square exactly as they paint; the 44px lives on a transparent hit box around them, the
// same split ask-scope-row uses. A test that asserted the CHIP grew would have forced the wrong
// fix — so it asserts the BUTTON does.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { HistoryResults, type HistoryPayload } from '@/components/history-results';
import { MarketingFooter } from '@/components/marketing/footer';
import { MarketingNav } from '@/components/marketing/nav';
import { VersePanelDemo } from '@/components/marketing/verse-panel-demo';

afterEach(cleanup);

const FLOOR_PX = 44;

/**
 * The declared base height of an element, in px, or null when it declares none.
 *
 * Reads only UNPREFIXED utilities — `sm:`/`md:` variants are the desktop relaxation, and the
 * phone value is the one the floor is about. Understands the two forms this codebase uses:
 * an arbitrary pixel value (`min-h-[44px]`, `h-[44px]`) and the spacing scale (`h-11` = 2.75rem
 * = 44px, `min-h-12` = 48px).
 */
function declaredHeightPx(el: HTMLElement): number | null {
  const heights = el.className
    .split(/\s+/)
    .filter((c) => c.length > 0 && !c.includes(':'))
    .map((c) => {
      const arbitrary = /^(?:min-)?h-\[(\d+(?:\.\d+)?)px\]$/.exec(c);
      if (arbitrary) return Number(arbitrary[1]);
      const scale = /^(?:min-)?h-(\d+(?:\.\d+)?)$/.exec(c);
      if (scale) return Number(scale[1]) * 4;
      return null;
    })
    .filter((n): n is number => n !== null);
  return heights.length === 0 ? null : Math.max(...heights);
}

function expectMeetsFloor(el: HTMLElement, what: string): void {
  const px = declaredHeightPx(el);
  expect(
    px,
    `${what} declares no base height utility at all — 44px has to be declared, not inherited ` +
      `from font metrics. Its classes were: ${el.className}`,
  ).not.toBeNull();
  expect(px, `${what} is a ${px}px target; the house floor is ${FLOOR_PX}px`).toBeGreaterThanOrEqual(FLOOR_PX);
}

// ── history-results ─────────────────────────────────────────────────────────────────────────

const WORK = { slug: 'josephus-antiquities', title: 'Antiquities', author: 'Josephus', edition: null };

const section = (id: number, period: [number, number]) => ({
  sectionId: id,
  ordinal: id,
  headingPath: ['Book I', `Chapter ${id}`],
  period,
  excerpt: `An excerpt from section ${id}.`,
  matched: ['text' as const],
});

const PAYLOAD: HistoryPayload = {
  interpretation: {
    entities: [
      { slug: 'herod', label: 'Herod' },
      { slug: 'jerusalem', label: 'Jerusalem' },
    ],
    period: { start: -40, end: 4 },
  },
  closest: { ...section(1, [-40, -30]), work: WORK },
  results: [
    {
      work: WORK,
      periodSpan: [-40, 100],
      // Five sections across two centuries: >3 gives the "Show all" control, and two distinct
      // century buckets gives the bucket chips (the row renders only when there is a choice).
      sections: [
        section(1, [-40, -30]),
        section(2, [-40, -30]),
        section(3, [-40, -30]),
        section(4, [50, 90]),
        section(5, [50, 90]),
      ],
    },
  ],
  coverage: { works: 12, sections: 4000 },
};

describe('history-results — the filter and Show controls clear 44px', () => {
  it('every entity chip is a 44px target', () => {
    render(<HistoryResults data={PAYLOAD} query="Herod in Jerusalem" threadId={null} />);
    for (const label of ['Herod', 'Jerusalem']) {
      expectMeetsFloor(screen.getByRole('button', { name: label }), `the "${label}" entity chip`);
    }
  });

  it('every century bucket chip is a 44px target', () => {
    render(<HistoryResults data={PAYLOAD} query="Herod in Jerusalem" threadId={null} />);
    const buckets = screen.getAllByRole('button', { name: /c( B\.C\.)? · \d+$/ });
    expect(buckets.length, 'the fixture must produce more than one bucket or the row does not render').toBeGreaterThan(1);
    for (const b of buckets) expectMeetsFloor(b, `the "${b.textContent}" century chip`);
  });

  it('"Show all N in this work" is a 44px target', () => {
    render(<HistoryResults data={PAYLOAD} query="Herod in Jerusalem" threadId={null} />);
    expectMeetsFloor(screen.getByRole('button', { name: /Show all 5 in this work/ }), 'the Show all control');
  });

  it('the copy-citation button is a 44px target', () => {
    render(<HistoryResults data={PAYLOAD} query="Herod in Jerusalem" threadId={null} />);
    const [copy] = screen.getAllByRole('button', { name: 'Copy citation' });
    expectMeetsFloor(copy!, 'the copy-citation button');
  });

  it('and the 30px chip still PAINTS at 30px — the hit box grew, the chip did not', () => {
    render(<HistoryResults data={PAYLOAD} query="Herod in Jerusalem" threadId={null} />);
    const chip = screen.getByRole('button', { name: 'Herod' });
    // The visible pill is a child span; enlarging the pill itself would have wrecked a filter row
    // that has to sit on one line beside "Matched:".
    const painted = chip.querySelector('span');
    expect(painted, 'the visible chip should be a child of the hit box, not the hit box itself').not.toBeNull();
    expect(declaredHeightPx(painted as HTMLElement)).toBe(30);
  });
});

// ── marketing ───────────────────────────────────────────────────────────────────────────────

describe('marketing surfaces clear 44px', () => {
  it('every footer link is a 44px target', () => {
    const { container } = render(<MarketingFooter />);
    const links = [...container.querySelectorAll<HTMLElement>('a[href]')];
    expect(links.length).toBe(6);
    for (const l of links) expectMeetsFloor(l, `the footer link "${l.textContent?.trim()}"`);
  });

  it('every voice tab in the verse-panel demo is a 44px target', () => {
    render(<VersePanelDemo />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(1);
    for (const t of tabs) expectMeetsFloor(t, `the "${t.textContent?.trim()}" voice tab`);
  });

  it('every marketing nav item is a 44px target', () => {
    const { container } = render(<MarketingNav active="home" />);
    // The skip link is excluded: it is `.skip-link`, positioned off-screen until focused, and
    // sizing it as a thumb target would put a 44px box over the top-left of every page.
    const links = [...container.querySelectorAll<HTMLElement>('a[href]')].filter(
      (a) => !a.className.includes('skip-link'),
    );
    for (const l of links) expectMeetsFloor(l, `the nav item "${l.textContent?.trim()}"`);
  });
});

// ── the CTA above the fold ──────────────────────────────────────────────────────────────────

describe('the marketing header carries a Request access CTA', () => {
  // THE FINDING: the only "Request access" on the landing page was the waitlist form's submit
  // button, the last element of a ~4,500px scroll. A visitor who did not scroll the whole page
  // never saw a way in, and the nav — the one piece of chrome that follows them down it — offered
  // only "Log in", which is for people who already have an account.
  it('links to the same #doors target the rest of the marketing tier uses', () => {
    render(<MarketingNav active="home" />);
    const cta = screen.getByRole('link', { name: 'Request access' });
    // `/#doors` is the cross-page form (features/page.tsx and why/page.tsx both use it) and works
    // from the landing page too, so one href serves all three surfaces.
    expect(cta.getAttribute('href')).toBe('/#doors');
  });

  it('is present on every marketing page, not just the landing page', () => {
    for (const page of ['home', 'features', 'why'] as const) {
      cleanup();
      render(<MarketingNav active={page} />);
      expect(
        screen.queryByRole('link', { name: 'Request access' }),
        `the CTA vanished on the ${page} page`,
      ).not.toBeNull();
    }
  });

  it('sits in the nav beside Log in, and Log in survives', () => {
    const { container } = render(<MarketingNav active="home" />);
    const nav = container.querySelector('nav')!;
    expect(within(nav).getByRole('link', { name: 'Log in' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Request access' })).toBeTruthy();
  });
});
