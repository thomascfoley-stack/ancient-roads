// The /auth/* route table, in a NON-client module on purpose.
//
// These lived in `components/auth-forms.tsx`, which carries 'use client'. A server component that
// imports a plain value from a client module does not receive the value: it receives a client
// reference proxy. `generateStaticParams` then called `.map` on it and the whole route 500'd with
// "AUTH_PATHS.map is not a function" -- at request time, invisible to tsc, which types the import
// as the array it textually is.
//
// Anything the SERVER needs to read as a real value has to live outside the client boundary.

export type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password';

export const AUTH_PATHS: AuthMode[] = [
  'sign-in',
  'sign-up',
  'forgot-password',
  'reset-password',
];

export function isAuthPath(p: string): p is AuthMode {
  return (AUTH_PATHS as string[]).includes(p);
}
