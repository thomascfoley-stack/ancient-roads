// @vitest-environment jsdom
//
// "Try again" on the app error page did nothing (production, 2026-09-13). It called `reset()`,
// which re-renders what the client already holds; for a server-side failure that is the same
// failed payload, so the error page came straight back. `retry()` re-fetches from the server.
// Next passes both to an error component; this pins which one the button uses.

import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AppError from '@/app/error';

afterEach(cleanup);

it('"Try again" re-fetches from the server rather than re-rendering the failed payload', () => {
  const reset = vi.fn();
  const retry = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Next hands the component both; the prop type only names the one it uses.
  const props = { error: new Error('boom'), reset, retry };
  render(<AppError {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(reset).not.toHaveBeenCalled();
});
