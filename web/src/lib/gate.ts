// Shared pieces of the pre-launch site password gate (see middleware.ts).
// Edge- and Node-safe: uses WebCrypto only.

export const GATE_COOKIE = 'site_gate';

export async function gateToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`ancient-paths-gate:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
