// @vitest-environment jsdom

// B038 — two "settings" surfaces exist under different routes with very different states:
// /settings (per-device reading preferences, localStorage) and /account/settings (email +
// change-password, server session). The RULING is cross-link, don't merge — merging would move
// auth-bound forms onto a device-preferences page, collapsing two deliberately separate security
// contexts into one file. So each page carries one quiet line pointing at the other, with copy
// that names what lives where.
//
// WHAT IS RENDERED AND WHAT IS READ AS SOURCE, STATED PLAINLY (the library-nav-labels.test.ts
// discipline):
//   - /settings/page.tsx is a synchronous server component with no data dependencies, so the
//     SHIPPED ROUTE is rendered here, form and all.
//   - /account/[path]/page.tsx is async and auth-gated (currentUser() + redirect + DB), so it
//     cannot be honestly rendered in jsdom. The cross-link lives in the client component it
//     serves (AccountSettings), which IS rendered; that the route serves that component is the
//     one property asserted as source text, and stated as such.

import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// AccountSettings imports the Neon auth client at module scope; nothing here authenticates,
// so it is doubled the way bible-position.test.tsx doubles the same module.
vi.mock('@/lib/auth/client', () => ({
  authClient: { changePassword: async () => ({ error: null }) },
}));

import SettingsPage from '@/app/settings/page';
import { AccountSettings } from '@/components/account-settings';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

afterEach(cleanup);

describe('B038 — the two settings surfaces link each other', () => {
  it('/settings links to account settings (the direction that already shipped)', () => {
    // This direction predates B038 (settings-form.tsx, "Account" section). Pinned so the pair of
    // links cannot silently become one again. SEED: point the href at /account -> RED (watched).
    render(<SettingsPage />);
    const link = screen.getByRole('link', { name: /email and password/i });
    expect(link.getAttribute('href')).toBe('/account/settings');
  });

  it('/account/settings links back to /settings — the direction B038 found missing', () => {
    // SEED: remove the quiet line -> RED. This is the defect verbatim: before the fix,
    // AccountSettings contained no href="/settings" anywhere.
    render(<AccountSettings email="reader@example.com" />);
    const link = screen.getByRole('link', { name: 'Settings' });
    expect(link.getAttribute('href')).toBe('/settings');
    // The copy must NAME THE SPLIT, not just point: the finding is that the two surfaces carry
    // very different state, and a bare "Settings" link would leave the reader to rediscover that.
    expect(document.body.textContent).toMatch(/per-device/i);
  });

  it('the account route actually serves the component asserted above', () => {
    // Source-text assertion, per the header: the route wrapper cannot be rendered honestly here.
    const src = readFileSync(path.join(REPO, 'web/src/app/account/[path]/page.tsx'), 'utf8');
    expect(src, 'the /account route no longer renders AccountSettings').toMatch(/<AccountSettings\s/);
  });
});
