// PROPERTY: a provider outage is reported as NOT RUN — never as a failure, and never as a pass.
//
// The scar: `ca53457` was a docs-only commit and `db-invariants` went RED because
// `section-vector-pairing.test.ts` got `429 engine_overloaded` from DeepInfra. Re-running the
// identical job with no code change passed. A gate that cannot tell "broken" from "provider busy"
// trains its readers to discount it — and this repo has already had a real red waved through.
//
// The other half of the property matters just as much: a genuine failure must NOT be laundered into
// NOT RUN. That would be strictly worse than the original defect, because it converts a red into
// silence. Every test below therefore has a paired negative.

import { describe, expect, it } from 'vitest';
import { isProviderUnavailable, probeProvider } from '../helpers/provider-availability';

const err = (m: string) => new Error(m);
const noSleep = async () => {};

describe('provider availability — what counts as "the service did not serve this"', () => {
  it('classifies real outage signals as UNAVAILABLE', () => {
    for (const m of [
      'Embedding request failed: 429 {"error":{"code":"engine_overloaded"}}',  // the exact ca53457 failure
      'Embedding request failed: 503 Service Unavailable',
      'Embedding request failed: 500',
      'fetch failed',
      'socket hang up',
      'ETIMEDOUT',
    ]) {
      expect(isProviderUnavailable(err(m)), m).toBe(true);
    }
  });

  it('does NOT launder a working provider’s rejection into NOT RUN', () => {
    // These are the provider answering correctly and refusing us — misconfiguration, which must
    // stay RED. If this leg ever goes green-by-skip, the taxonomy has become a way to hide bugs.
    for (const m of [
      'Embedding request failed: 401 Unauthorized',   // bad/missing key
      'Embedding request failed: 400 Bad Request',    // malformed input
      'Embedding request failed: 403 Forbidden',
      'Embedding request failed: 404 Not Found',
      'cos to own vector 0.2 is not clear of cos to other 0.9',  // a real invariant failure
    ]) {
      expect(isProviderUnavailable(err(m)), m).toBe(false);
    }
  });

  // THE CASE THAT MAKES THE 4xx GUARD LOAD-BEARING, rather than decorative.
  // The network patterns are deliberately loose (`network`, `timeout`, `fetch failed`) because
  // Node surfaces transport failures in many shapes. That looseness collides with 4xx messages
  // that happen to contain those words — and without the explicit 4xx early-return, such an error
  // would be classified as an outage and the genuine misconfiguration would vanish into NOT RUN.
  // Removing the guard passes every other assertion in this file, so this is the one that proves it.
  it('a 4xx that MENTIONS a network word is still a genuine failure', () => {
    for (const m of [
      'Embedding request failed: 400 Bad Request — fetch failed to parse input',
      'Embedding request failed: 401 Unauthorized (network policy denied this key)',
      'Embedding request failed: 403 Forbidden: request timeout policy',
    ]) {
      expect(isProviderUnavailable(err(m)), m).toBe(false);
    }
  });
});

describe('probeProvider — bounded retry, then NOT RUN', () => {
  it('SUCCEEDS on the first attempt when the provider is up', async () => {
    let calls = 0;
    const r = await probeProvider(async () => { calls++; }, { sleep: noSleep });
    expect(r.present).toBe(true);
    expect(calls).toBe(1);
  });

  it('RETRIES a transient 429 and then succeeds — coverage is not lost to a blip', async () => {
    let calls = 0;
    const r = await probeProvider(async () => {
      calls++;
      if (calls < 3) throw err('429 engine_overloaded');
    }, { sleep: noSleep });
    expect(r.present).toBe(true);
    expect(calls).toBe(3);
  });

  it('reports NOT RUN (present=false) when 429 persists — never a failure', async () => {
    let calls = 0;
    const r = await probeProvider(async () => { calls++; throw err('429 engine_overloaded'); }, { sleep: noSleep });
    expect(r.present, 'a sustained outage must be NOT RUN, not RED').toBe(false);
    expect(calls).toBe(3);
    expect(r.error).toContain('429');
  });

  it('RE-THROWS a genuine failure immediately — no retry, no skip', async () => {
    let calls = 0;
    await expect(probeProvider(async () => {
      calls++;
      throw err('Embedding request failed: 401 Unauthorized');
    }, { sleep: noSleep })).rejects.toThrow(/401/);
    expect(calls, 'a genuine failure must not be retried into silence').toBe(1);
  });

  it('does not swallow a non-provider error raised after a transient one', async () => {
    let calls = 0;
    await expect(probeProvider(async () => {
      calls++;
      throw calls === 1 ? err('429 engine_overloaded') : err('cosine mismatch: 0.2 < 0.8');
    }, { sleep: noSleep })).rejects.toThrow(/cosine mismatch/);
    expect(calls).toBe(2);
  });
});
