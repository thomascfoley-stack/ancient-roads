// @vitest-environment jsdom
//
// THE PROCESSOR LIST IS WRITTEN FROM THE CODE. The privacy page's own header comment
// (page.tsx:8-13) pins the invariant: "WRITTEN FROM THE CODE, NOT FROM A TEMPLATE… If you
// change what the product collects, change this page in the same commit." The "Who else
// touches it" section (page.tsx:101-112) enumerates the third parties that process user
// data, and the page frames that list as PROCESSORS (page.tsx:103-104: "These companies
// process data on our behalf, under their own security terms").
//
// The finding (PR #328, commit 6daff0e7): the list named Resend as the sender of
// sign-in verification email, but Resend has no codepath into user data. web/src/lib/mail.ts
// — the only Resend call site — was deleted in b9cb341d on 2026-09-06, ten days BEFORE the
// page was authored. Verification and password-reset mail is dispatched by Neon's hosted
// auth service: authClient.sendVerificationEmail / requestPasswordReset / resetPassword in
// auth-forms.tsx, proxied to NEON_AUTH_BASE_URL by app/api/auth/[...path]/route.ts. The
// disclosure therefore named a processor relationship the current code does not have.
//
// This file is the mechanical guard for that header invariant. It renders the page (a
// synchronous server component — no DB, no auth, no mocks needed) and asserts the processor
// list matches the live code, in both directions: a STALE processor re-added (Resend) and a
// LIVE processor silently dropped are both failures. Resend is also refuted by name, so the
// specific stale entry the bug removed cannot quietly come back even if the set check is
// weakened one day.
//
// SEED: restore the Resend <li> (page.tsx, "Resend — sends account email…") and both the
// set check and the named refuter go red.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import PrivacyPage from '@/app/privacy/page';

afterEach(cleanup);

// The processors the code actually routes user data through today, derived from the live
// call sites — not from the page: Vercel (hosting + the private Blob store for uploads),
// Neon (the database + the hosted accounts service, which also dispatches the verification
// and password-reset email), DeepInfra (embeddings + the short framing sentence), PostHog
// (product analytics). Resend is deliberately absent: no dependency in web/package.json, no
// import, no env var (RESEND_API_KEY / MAIL_FROM), and no call site in the current tree.
const EXPECTED_PROCESSORS = ['Vercel', 'Neon', 'DeepInfra', 'PostHog'] as const;

function processorNames(container: HTMLElement): string[] {
  // The "Who else touches it" <ul> is the ONLY <ul> inside the <article> — MarketingFooter's
  // lists are siblings of the article, not inside it — so scoping to article > ul > li is
  // unambiguous. Each processor is the <strong> child of its list item.
  const article = container.querySelector('article');
  expect(article, 'the privacy page renders an <article> root for its body').not.toBeNull();
  const lis = [...container.querySelectorAll('article ul > li')];
  return lis.map((li) => li.querySelector('strong')?.textContent?.trim() ?? '');
}

describe("the privacy page's 'Who else touches it' list stays written from the code", () => {
  it('names exactly the processors the current code routes user data through', () => {
    const { container } = render(<PrivacyPage />);
    const names = processorNames(container);

    // Exact multiset (sorted, so order is not pinned — only membership AND count): a STALE
    // processor re-added (Resend), a LIVE processor silently dropped, or a duplicate entry
    // are all failures. The list grows only when a real codepath grows; that is the page's
    // own rule.
    expect(
      [...names].sort(),
      'the processor list changed shape — verify each name against a live call site, then update EXPECTED_PROCESSORS in the same commit',
    ).toEqual([...EXPECTED_PROCESSORS].sort());
  });

  it('does not name Resend, which has no codepath into user data', () => {
    const { container } = render(<PrivacyPage />);
    // The named refuter: even if the set check above is weakened one day, this asserts the
    // specific stale entry the bug removed cannot return. SEED it by restoring the Resend
    // <li> ("Resend — sends account email, such as sign-in verification.") and it goes red.
    expect(
      processorNames(container),
      'Resend was removed because web/src/lib/mail.ts is gone (b9cb341d) and verification mail is dispatched by Neon Auth',
    ).not.toContain('Resend');
  });

  it('surfaces Neon as the dispatcher of verification email, the actual mail codepath', () => {
    const { container } = render(<PrivacyPage />);
    const neonLi = [...container.querySelectorAll('article ul > li')].find(
      (li) => li.querySelector('strong')?.textContent?.trim() === 'Neon',
    );
    expect(neonLi, 'the Neon processor bullet must be present').toBeTruthy();
    // The only mail-sending codepath today is Neon Auth's sendVerificationEmail (and the
    // password-reset pair), proxied to NEON_AUTH_BASE_URL. Surfacing it on the Neon bullet
    // keeps the disclosure complete once the stale Resend bullet is removed, so a reader
    // scanning the list still sees who sends the email that verifies their address.
    expect(neonLi!.textContent).toMatch(/email that verifies your address/i);
  });

  it('renders a "Last updated" date in the page\'s documented shape', () => {
    render(<PrivacyPage />);
    // Shape, not value: a stale-pinned date is the classic watchlist artifact this repo
    // guards against. The page's own "Changes" section (page.tsx:158-162) rules that the
    // date moves when the page does; the value invariant is a manual check in the test
    // plan, not a hard pin that would itself go stale.
    expect(screen.getByText(/Last updated/i).textContent).toMatch(
      /Last updated \d{1,2} [A-Z][a-z]+ \d{4}/,
    );
  });
});
