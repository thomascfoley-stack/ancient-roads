// createThreadWithQuestion title site — the research.ts half of BUG_SWEEP B2 (#120).
// TITLE_MAX is 80 and the cap was `question.slice(0, TITLE_MAX - 1)`: 78 ASCII + an emoji puts
// the pair's halves on either side of code unit 79, so the stored title carried a lone
// surrogate → U+FFFD in Postgres. RED-PROOF: against the slice version the round-trip
// assertion below fails on the replacement char.
import { describe, expect, it, vi } from 'vitest';

const { captured } = vi.hoisted(() => ({ captured: { titles: [] as string[] } }));

vi.mock('@/lib/db', () => ({
  runAsUser: async (_userId: string, build: (sql: unknown) => { text: string; values: unknown[] }[]) => {
    const stmts = build((strings: TemplateStringsArray, ...values: unknown[]) => ({
      text: strings.join('?'),
      values,
    }));
    for (const s of stmts) {
      if (s.text.includes('INSERT INTO chats')) captured.titles.push(s.values[1] as string);
    }
    return [[{ chat_id: '11111111-2222-4333-8444-555555555555', id: '11111111-2222-4333-8444-666666666666' }]];
  },
  getDb: vi.fn(),
}));

const { createThreadWithQuestion } = await import('@/lib/research');

describe('createThreadWithQuestion title truncation (#120)', () => {
  it('a title truncated on a surrogate pair stores no U+FFFD', async () => {
    // 78 ASCII + emoji + tail: code-unit slice(0, 79) lands mid-pair.
    await createThreadWithQuestion('test-user', `${'a'.repeat(78)}\u{1F600}tail`);
    const title = captured.titles[0]!;
    const roundTrip = Buffer.from(title, 'utf8').toString('utf8');
    expect(roundTrip).toBe(title);
    expect(roundTrip).not.toContain('�');
    expect(title.endsWith('…')).toBe(true);
    expect(title).toBe(`${'a'.repeat(78)}\u{1F600}…`);
  });

  it('a short question is stored verbatim', async () => {
    captured.titles.length = 0;
    await createThreadWithQuestion('test-user', 'short title');
    expect(captured.titles[0]).toBe('short title');
  });
});
