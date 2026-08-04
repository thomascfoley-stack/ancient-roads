// @vitest-environment jsdom
//
// THE READING PLAN BECOMES READABLE.
//
// A topical plan day lists up to ~18 references and, before this, listed nothing else: you could
// see that Nave's cites 1 Kings 18:24-39 under PRAYER and had no way to read it without leaving
// the plan. These cases drive the real components against a stubbed chapter file, and assert the
// two things that make the feature honest rather than merely present:
//   - the preview shows the CITED window and not the surrounding chapter (v23 must not appear)
//   - "Read the whole chapter" is what widens it, in the same pane, on purpose
//
// The presentation split is asserted through matchMedia, because it is chosen by INPUT CAPABILITY
// and not by width — a touchscreen laptop has no hover to preview with.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PassagePane } from '@/components/passage-pane';
import { VerseRef } from '@/components/verse-ref';

// 1 Kings 18, all 46 verses, each individually identifiable so a window can be proven.
const CH18 = {
  book: 11,
  chapter: 18,
  verses: Array.from({ length: 46 }, (_, i) => ({ verse: i + 1, text: `Carmel verse ${i + 1}.` })),
};

const CITED = { verseStart: 11_018_024, verseEnd: 11_018_039, label: '1 Kings 18:24-39' };

function stubHover(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/bible/web/1ki/18.json')) {
        return { ok: true, status: 200, json: async () => CH18 } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }),
  );
});

// This config does not enable vitest globals, so testing-library never registers its automatic
// cleanup; without this every render stacks and queries report multiple matches.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('VerseRef — reading a citation without leaving the plan', () => {
  it('on a touch device, tapping opens a sheet with the cited verses', async () => {
    stubHover(false);
    const onOpen = vi.fn();
    render(<VerseRef {...CITED} translation="web" onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: '1 Kings 18:24-39' }));

    const sheet = await screen.findByRole('dialog');
    await waitFor(() => expect(sheet.textContent).toContain('Carmel verse 24.'));
    expect(sheet.textContent).toContain('Carmel verse 39.');
    // SEED: drop the fromVerse/toVerse filter in fetchSpanVerses and this goes red — the preview
    // would quietly show the whole chapter while the header still said 24-39.
    expect(sheet.textContent).not.toContain('Carmel verse 23.');
    expect(sheet.textContent).not.toContain('Carmel verse 40.');
    // The tap PREVIEWS; opening the reader is a second, deliberate press.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('the sheet hands off to the reader pane with the reference it was showing', async () => {
    stubHover(false);
    const onOpen = vi.fn();
    render(<VerseRef {...CITED} translation="web" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: '1 Kings 18:24-39' }));
    fireEvent.click(await screen.findByRole('button', { name: /open in reader/i }));
    expect(onOpen).toHaveBeenCalledWith(CITED);
  });

  it('on a pointer device, clicking opens the pane directly instead of a sheet', async () => {
    stubHover(true);
    const onOpen = vi.fn();
    render(<VerseRef {...CITED} translation="web" onOpen={onOpen} />);
    // Wait for the capability effect to land before clicking.
    await waitFor(() => expect(window.matchMedia('(hover: hover) and (pointer: fine)').matches).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: '1 Kings 18:24-39' }));
    expect(onOpen).toHaveBeenCalledWith(CITED);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a malformed reference says so instead of rendering an empty box', async () => {
    stubHover(false);
    render(
      <VerseRef verseStart={99_001_001} verseEnd={99_001_005} label="Nowhere 1:1-5" translation="web" onOpen={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nowhere 1:1-5' }));
    const sheet = await screen.findByRole('dialog');
    await waitFor(() => expect(sheet.textContent).toContain('No verses found'));
  });
});

describe('PassagePane — the cited window, and the chapter behind it', () => {
  it('opens on the cited verses only', async () => {
    const { container } = render(<PassagePane target={CITED} translation="web" onClose={vi.fn()} />);
    await waitFor(() => expect(container.textContent).toContain('Carmel verse 24.'));
    expect(container.textContent).not.toContain('Carmel verse 23.');
    expect(container.textContent).toContain('1 Kings 18:24-39');
  });

  it('"Read the whole chapter" widens it in the SAME pane, and can go back', async () => {
    const onClose = vi.fn();
    const { container } = render(<PassagePane target={CITED} translation="web" onClose={onClose} />);
    await waitFor(() => expect(container.textContent).toContain('Carmel verse 24.'));

    fireEvent.click(screen.getByRole('button', { name: /read the whole chapter/i }));
    await waitFor(() => expect(container.textContent).toContain('Carmel verse 1.'));
    expect(container.textContent).toContain('Carmel verse 46.');
    // Widening must not navigate away — the pane is still the thing on screen.
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /back to 1 Kings 18:24-39/i }));
    await waitFor(() => expect(container.textContent).not.toContain('Carmel verse 23.'));
  });

  it('offers no "whole chapter" control when the reference already IS a whole chapter', async () => {
    const { container } = render(
      <PassagePane
        target={{ verseStart: 11_018_001, verseEnd: 11_018_999, label: '1 Kings 18' }}
        translation="web"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.textContent).toContain('Carmel verse 1.'));
    // A control that cannot change anything is noise; it must not render.
    expect(screen.queryByRole('button', { name: /read the whole chapter/i })).toBeNull();
  });
});
