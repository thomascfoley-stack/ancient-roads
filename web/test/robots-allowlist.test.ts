// ★ robots.txt allowlist — the second lock on the licensed corpus.
//
// `web/src/app/robots.ts` exists to make the marketing tier crawlable and KEEP the licensed
// corpus (/read/*, /bible/*, /commentaries/*, /library/*, /work/*) un-crawlable, with no edit
// required at SEC-1 closure (the failure mode `middleware.ts:10` invites the operator into by
// saying "Remove the gate when SEC-1 closes"). The bug this test pins was introduced in
// 60a43f14: `PUBLIC_MARKETING_ROUTES` carries the bare string "/", and robots.ts spread it
// verbatim into `allow`, so Next.js rendered `Allow: /` alongside `Disallow: /`. Under RFC 9309
// §2.2.2 both match every path with equal specificity, the allow wins, and the whole site —
// licensed corpus included — becomes crawlable the moment /robots.txt is reachable.
//
// The fix end-anchors the root entry to "/$" (matches only the homepage). This test asserts the
// rendered /robots.txt body (replicating the installed next@^16.3.5 serializer) AND the
// RFC 9309 §2.2.2 crawler decision, so a regression is caught before it ships, not after the
// crawl that cannot be undone. Red-first proof: revert the .map in robots.ts (or temporarily
// stop end-anchoring "/") and the corpus cases below go RED.
import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import { PUBLIC_MARKETING_ROUTES } from '@/lib/gate';

// Minimal structural view of `MetadataRoute.Robots` — typed locally so the test does not depend
// on Next's type resolver. Compatible with `ReturnType<typeof robots>`.
type RobotsRule = {
  userAgent?: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
};
type RobotsOutput = { rules: RobotsRule | RobotsRule[]; sitemap?: string | string[] };

const toArray = (v: string | string[] | undefined): string[] =>
  v ? (Array.isArray(v) ? v : [v]) : [];

// Replicates `resolveRobots` in the installed next@^16.3.5
// (node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.js): one
// `Allow:` / `Disallow:` line per entry, no "/" special-casing, no de-dup vs disallow. Asserting
// the rendered bytes (not just the in-memory object) is what catches the bug — the dangerous
// artefact is the literal `Allow: /` line a crawler receives, not the object that produced it.
function renderRobotsTxt(r: RobotsOutput): string {
  let content = '';
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  for (const rr of rules) {
    const uas = toArray(rr.userAgent);
    for (const ua of uas.length ? uas : ['*']) content += `User-Agent: ${ua}\n`;
    for (const it of toArray(rr.allow)) content += `Allow: ${it}\n`;
    for (const it of toArray(rr.disallow)) content += `Disallow: ${it}\n`;
    content += '\n';
  }
  for (const s of toArray(r.sitemap)) content += `Sitemap: ${s}\n`;
  return content;
}

// RFC 9309 §2.2.2 matcher for THIS robots.txt: the patterns here use prefix matching + the `$`
// end-anchor only (no `*` wildcards are emitted, so they are not implemented). The longest-octet
// matching rule wins; an allow and a disallow of equal specificity → the allow wins ("If an
// 'allow' rule and a 'disallow' rule are equivalent, then the 'allow' rule SHOULD be used."). A
// path matching no rule is allowed (§2.2.2: "If no record matches ... access is allowed").
function isCrawlable(allow: string[], disallow: string[], path: string): boolean {
  const matched: Array<{ allow: boolean; spec: number }> = [];
  const all: Array<{ p: string; allow: boolean }> = [
    ...allow.map((p) => ({ p, allow: true })),
    ...disallow.map((p) => ({ p, allow: false })),
  ];
  for (const r of all) {
    let p = r.p;
    let anchored = false;
    if (p.endsWith('$')) {
      anchored = true;
      p = p.slice(0, -1);
    }
    if (!path.startsWith(p)) continue;
    if (anchored && path !== p) continue;
    matched.push({ allow: r.allow, spec: p.length });
  }
  if (matched.length === 0) return true;
  const max = Math.max(...matched.map((m) => m.spec));
  return matched.some((m) => m.spec === max && m.allow);
}

const out = robots() as RobotsOutput;
const rule = Array.isArray(out.rules) ? out.rules[0] : out.rules;
const allowPatterns = toArray(rule.allow);
const disallowPatterns = toArray(rule.disallow);
const body = renderRobotsTxt(out);

describe('robots() — marketing-tier allowlist (RFC 9309)', () => {
  it('is an allowlist, not a blocklist: defaults to Disallow: /', () => {
    expect(disallowPatterns).toContain('/');
    expect(body).toContain('Disallow: /');
  });

  it('end-anchors the root to "/$" — never the bare "Allow: /" that ties and beats Disallow: /', () => {
    // The bug (commit 60a43f14): PUBLIC_MARKETING_ROUTES carried "/", serialized to `Allow: /`,
    // which per RFC 9309 §2.2.2 ties `Disallow: /` and — allow wins — exposes every path. The
    // root MUST be end-anchored so it matches only the homepage. (sitemap.ts is safe: it
    // special-cases "/" to the exact URL https://ancientpaths.app. robots.ts treats entries as
    // prefix patterns, so the consumer-side special-case is the fix.)
    expect(allowPatterns).not.toContain('/');
    expect(allowPatterns).toContain('/$');
    // Rendered form: no bare "Allow: /" line; the end-anchored "Allow: /$" line is present.
    expect(body).not.toMatch(/^Allow: \/$/m);
    expect(body).toMatch(/^Allow: \/\$$/m);
  });

  it('renders the exact /robots.txt body a crawler receives', () => {
    const expected = [
      'User-Agent: *',
      ...PUBLIC_MARKETING_ROUTES.map((p) => `Allow: ${p === '/' ? '/$' : p}`),
      'Disallow: /',
      '',
      'Sitemap: https://ancientpaths.app/sitemap.xml',
      '',
    ].join('\n');
    expect(body).toBe(expected);
  });

  it('allows the public marketing tier to be crawled', () => {
    for (const p of ['/', '/about', '/features', '/why', '/privacy', '/terms']) {
      expect(isCrawlable(allowPatterns, disallowPatterns, p), `${p} must be crawlable`).toBe(true);
    }
  });

  it('BLOCKS the licensed corpus — the existential licensing rule (CLAUDE.md)', () => {
    // /read/*, /bible/*, /commentaries/*, /library/*, /work/* are licensed text the wall exists
    // to protect. None may be crawlable once /robots.txt is served (i.e. after SEC-1 closure).
    for (const p of [
      '/read', '/read/jhn/1', '/read/jhn/1/2',
      '/bible', '/bible/kjv/jhn.json', '/bible/lsv/gen.json',
      '/commentaries', '/commentaries/john.json', '/commentaries/x/y.json',
      '/library', '/library/notes',
      '/work', '/work/x',
    ]) {
      expect(isCrawlable(allowPatterns, disallowPatterns, p), `${p} must NOT be crawlable`).toBe(false);
    }
  });

  it('BLOCKS the app + API tier (not in the marketing allowlist)', () => {
    for (const p of ['/ask', '/api/ask', '/api/annotations', '/home', '/settings', '/gate', '/account']) {
      expect(isCrawlable(allowPatterns, disallowPatterns, p), `${p} must NOT be crawlable`).toBe(false);
    }
  });

  it('keeps the allow list in lockstep with PUBLIC_MARKETING_ROUTES (DERIVED, never hand-typed)', () => {
    // Every marketing route is published as an allow rule (with "/" → "/$"); nothing else is.
    // This is the property that keeps robots.ts and sitemap.ts in lockstep with the gate: adding
    // a crawlable page is one edit in gate.ts, and a page cannot become crawlable by being
    // forgotten. Red if a future edit widens robots.ts past PUBLIC_MARKETING_ROUTES.
    const expected = PUBLIC_MARKETING_ROUTES.map((p) => (p === '/' ? '/$' : p)).sort();
    expect([...allowPatterns].sort()).toEqual(expected);
  });

  it('points crawlers at the sitemap', () => {
    expect(out.sitemap).toBe('https://ancientpaths.app/sitemap.xml');
    expect(body).toContain('Sitemap: https://ancientpaths.app/sitemap.xml');
  });
});
