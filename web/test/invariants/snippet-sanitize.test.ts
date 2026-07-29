// Guards the shared ts_headline snippet sanitizer (web/src/lib/snippet.ts). The
// deep-audit (2026-07-24) found catalog-search.tsx rendering the raw ts_headline
// snippet via dangerouslySetInnerHTML while the identical sink in library/passages
// sanitized it. Both now import this one function; these tests prove it neutralizes
// tag-shaped body text and preserves ONLY the <mark> pairs ts_headline inserts.
import { describe, expect, it } from 'vitest';
import { sanitizeSnippet } from '@/lib/snippet';

describe('sanitizeSnippet (the ts_headline XSS floor)', () => {
  it('neutralizes an injected script/img payload that survived ingest', () => {
    const raw = 'before <img src=x onerror=alert(1)> and <script>alert(2)</script> after';
    const out = sanitizeSnippet(raw);
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&lt;script&gt;');
  });

  it('preserves the <mark> highlight pairs ts_headline inserted', () => {
    const raw = 'the word <mark>grace</mark> appears';
    expect(sanitizeSnippet(raw)).toBe('the word <mark>grace</mark> appears');
  });

  it('escapes a fake <mark-like> tag in the body but keeps the real ones', () => {
    // A body containing the literal text "<marker>" must NOT become a live tag.
    const raw = 'a <marker> flag with a real <mark>hit</mark>';
    const out = sanitizeSnippet(raw);
    expect(out).toContain('&lt;marker&gt;');
    expect(out).toContain('<mark>hit</mark>');
  });

  it('escapes ampersands (no entity smuggling)', () => {
    expect(sanitizeSnippet('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });
});
