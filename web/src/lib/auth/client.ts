'use client';

import { createAuthClient } from 'better-auth/react';

// Points at this app's own /api/auth handler, not at a Neon-hosted service (SEC-1 cutover).
// `basePath` must match `authOptions.basePath` in better-auth.ts; they are asserted equal by
// web/test/invariants/better-auth-wiring.test.ts.
export const authClient = createAuthClient({ basePath: '/api/auth' });
