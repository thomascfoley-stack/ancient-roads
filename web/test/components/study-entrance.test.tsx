// @vitest-environment jsdom
//
// THE STUDY ENTRANCE (order 2026-08-20-historians-study-entrance): the Historians shelf leads
// with "What do you want to study?" and routes the question into the shipped History mode —
// it does NOT run its own retrieval. What is pinned:
//
//   * Submit navigates to /ask?mode=history&q=<encoded query> — the entrance is a router,
//     never a second search engine beside the fenced one.
//   * Example chips submit IMMEDIATELY (the History-mode chip contract, the opposite of the
//     voices-mode chips, which only fill the composer — that asymmetry is deliberate and
//     documented on both components).
//   * An empty submit goes nowhere. A blank study is not a study.
//   * Exact-phrase search survives behind a reveal — the classic body-text FTS is demoted,
//     not deleted. The reveal must render the real CatalogSearch, not a lookalike.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushes: string[] = [];
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => pushes.push(href), replace: () => {} }),
}));

import { StudyEntrance } from '@/components/study-entrance';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  pushes.length = 0;
});

const PROPS = { catalog: 'historians' as const, label: 'Historians', traditions: [] };

describe('the study entrance routes into History mode', () => {
  it('asks the question and carries the typed query to /ask?mode=history', () => {
    render(<StudyEntrance {...PROPS} />);

    expect(screen.getByText('What do you want to study?')).toBeTruthy();
    expect(screen.getByText(/points you into the sources/i)).toBeTruthy();

    const input = screen.getByLabelText('What do you want to study?');
    fireEvent.change(input, { target: { value: 'the council of Nicea' } });
    fireEvent.submit(input.closest('form')!);

    expect(pushes).toEqual(['/ask?mode=history&q=the%20council%20of%20Nicea']);
  });

  it('an example chip submits immediately', () => {
    render(<StudyEntrance {...PROPS} />);

    fireEvent.click(screen.getByRole('button', { name: 'the church at Ephesus' }));

    expect(pushes).toEqual(['/ask?mode=history&q=the%20church%20at%20Ephesus']);
  });

  it('an empty submit goes nowhere', () => {
    render(<StudyEntrance {...PROPS} />);

    const input = screen.getByLabelText('What do you want to study?');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);

    expect(pushes).toEqual([]);
  });

  it('exact-phrase search is demoted behind a reveal, and the reveal is the real CatalogSearch', () => {
    render(<StudyEntrance {...PROPS} />);

    // Hidden until asked for — the entrance leads with the question, not two search boxes.
    expect(screen.queryByPlaceholderText('Search historians…')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /exact-phrase search/i }));

    // CatalogSearch's own templated placeholder — proof the shipped component mounted.
    expect(screen.getByPlaceholderText('Search historians…')).toBeTruthy();
  });
});
