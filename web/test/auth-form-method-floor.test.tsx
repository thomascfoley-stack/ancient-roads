// @vitest-environment jsdom
//
// THE AUTH FORM MUST NOT DEFAULT TO GET — a credential floor for when JS has not taken over.
//
// A <form> with no `method` submits as GET, putting every field in the query string. For this form
// that means `?name=…&email=…&password=…` in the address bar, browser history, the server access
// log, and the Referer header of whatever the user clicks next.
//
// THIS IS NOT A THEORETICAL FLOOR. Measured 2026-08-24 against BOTH a dev server and a local
// PRODUCTION build (`next build` + `next start`, gate passed): the <Suspense> boundary wrapping
// AuthForm does not hydrate on /auth/sign-up or /auth/sign-in. 181 of the page's 234 nodes hydrate
// — `main`, `nav`, `body`, links, the shell's buttons — while this form and its inputs do not, so
// `onSubmit` is never attached and the browser performs its default submit. The first sign-up
// attempt of the night produced exactly:
//     /auth/sign-up?name=UX+Test+K45&email=uxtest%2Bk45a%40example.com&password=a-long-enough-…
// Control, same browser and same hidden-pane conditions, back to back: /read/jhn/3 hydrates.
// Reverting to the pre-change component reproduced it, so the hydration failure is not ours.
//
// The hydration bug is filed separately and is the real defect. This test pins the FLOOR, which is
// worth having on its own terms: whatever the reason JS does not run — hydration failure, a chunk
// 404, a CSP change, a browser with JS off — the password must not end up in a URL.
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/auth/client', () => ({ authClient: {} }));

import { AuthForm } from '@/components/auth-forms';
import { AUTH_PATHS } from '@/lib/auth/paths';

afterEach(cleanup);

describe('auth forms never fall back to a GET submit', () => {
  for (const path of AUTH_PATHS) {
    it(`/auth/${path} sets method=post`, () => {
      const { container } = render(<AuthForm path={path as 'sign-in'} />);
      const form = container.querySelector('form');
      // forgot-password's confirmation screen renders no form; nothing to protect there.
      if (!form) return;
      expect(
        (form.getAttribute('method') || 'get').toLowerCase(),
        `a form carrying a password field must not submit as GET (/auth/${path})`,
      ).toBe('post');
    });
  }

  it('the password field is inside that form — the reason the method matters', () => {
    const { container } = render(<AuthForm path="sign-up" />);
    const form = container.querySelector('form');
    expect(form?.querySelector('input[type="password"]')).toBeTruthy();
  });
});
