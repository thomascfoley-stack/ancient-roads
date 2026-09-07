// @vitest-environment jsdom
//
// /search HAS A LOADING BOUNDARY, and it speaks the app's skeleton vocabulary.
//
// /search is a server component with `dynamic = 'force-dynamic'` that runs up to six full-text
// corpus queries plus four personal ones per request (F-168), and it had no loading.tsx at all.
// Without one, App Router blocks on the server render with the PREVIOUS page still on screen and
// nothing indicating that anything is happening — the exact complaint /library's loading.tsx was
// written to answer.
//
// The vocabulary is not decoration, it is the house rule: a shaped skeleton rather than a spinner
// (there are no spinners in this app), `animate-pulse` (inert under prefers-reduced-motion, see
// globals.css), one `aria-busy` container, one `sr-only` label naming what is loading, and the
// bars hidden from assistive tech behind `aria-hidden`. Hairlines go through `.edge` — the
// literal `border-stone-200 dark:border-stone-800` pair is MEASURED broken in dark mode
// (globals.css:231-268), and /library's own loading.tsx still uses it, so copying that file
// verbatim would ship the bug.
//
// SEED: delete web/src/app/search/loading.tsx and the import fails. Swap `animate-pulse` for a
// spinner element and the motion assertion goes red.

import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SearchLoading from '../../src/app/search/loading';

afterEach(cleanup);

describe('/search loading boundary', () => {
  it('announces itself once, to assistive tech, without exposing the bars', () => {
    const { container } = render(<SearchLoading />);

    const busy = container.querySelector('[aria-busy]');
    expect(busy, 'the skeleton container is marked aria-busy').not.toBeNull();

    // The reader on a screen reader is TOLD what is loading — a silent skeleton is a blank page.
    expect(screen.getByText(/loading search results/i)).toBeTruthy();

    // Every decorative bar sits behind aria-hidden, so the announcement is heard once and the
    // shape is not read out as content.
    const bars = container.querySelectorAll('.animate-pulse');
    expect(bars.length, 'the bars use the app-wide animate-pulse idiom').toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar.closest('[aria-hidden]'), 'skeleton bars are hidden from assistive tech').not.toBeNull();
    }
  });

  it('mirrors the search page box, and paints its hairlines through .edge', () => {
    const { container } = render(<SearchLoading />);

    // Same outermost box as app/search/page.tsx, so the real content lands without a layout jump.
    expect(container.querySelector('.mx-auto.w-full.max-w-3xl.px-5.pb-24.pt-8')).not.toBeNull();

    // The results list is hairline-separated in the real page (`border-y edge`). Any hairline the
    // skeleton draws must go through .edge, never the pair that loses the cascade in dark mode.
    const html = container.innerHTML;
    // The CLASS, not the substring — "edge" inside an attribute value or a word like "hedge"
    // satisfied the first draft (deep audit, 2026-09-07).
    expect(container.querySelector('.edge'), 'hairlines go through .edge').not.toBeNull();
    expect(html, 'the measured-broken border pair must not be reintroduced').not.toMatch(
      /border-stone-200[^"]*dark:border-stone-800/,
    );
  });

  it('is a skeleton, not a spinner — the only sanctioned motion in this app', () => {
    const { container } = render(<SearchLoading />);
    const html = container.innerHTML;
    expect(html, 'no spinner').not.toMatch(/animate-spin|spinner|role="progressbar"/i);
  });
});
