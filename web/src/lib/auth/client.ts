'use client';

import { createAuthClient } from '@neondatabase/auth/next';

// Neon Auth's client, defaulting to this app's own /api/auth/[...path] route (ADR-107/108) --
// no baseURL/basePath option, unlike the Better Auth client it replaces. `signIn.email`,
// `signUp.email`, `requestPasswordReset`, `resetPassword` all kept their option shapes; verified
// against the installed package's types before this swap, per docs/AUTH_V2_IMPLEMENTATION.md §6.
export const authClient = createAuthClient();
