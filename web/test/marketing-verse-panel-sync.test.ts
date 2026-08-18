// The marketing verse-panel demo carries ten baked excerpts (the corpus is gated, so the
// public page cannot fetch it). This is the dev-time twin of the guard that keeps that
// page honest: every excerpt must be a VERBATIM substring of a SERVED entry by that
// author on John 1:1, and every author must pass isPublishedCommentaryEntry. Red-proof:
// change one word of any excerpt in verse-panel-demo.tsx, or name an unserved author,
// and this goes red.
//
// The substantive assertions live in helpers/marketing-verse-panel-check.ts, SHARED with
// scripts/predeploy-gate.ts (leg: "marketing verse-panel excerpts"). That split is the
// point: the corpus is gitignored, so CI can never have it and this suite LOUD-skips
// there (announceSkip below, never a silent pass) — but the gate runs the SAME module
// with no artifact exemption at the one moment the corpus is provably present and about
// to ship. Before 2026-08-17 the comment here claimed the gate already did that; it did
// not (the gate never ran vitest), so C1 on the public front door rested on someone
// running vitest locally. Now the enforcement is the gate's, and this file is the fast
// local loop.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { VERSE_PANEL_VOICES } from '@/components/marketing/verse-panel-demo';
import { announceSkip } from './helpers/loud-skip';
import { loadJohn1Entries, marketingVersePanelFindings } from './helpers/marketing-verse-panel-check';

const file = path.join(__dirname, '..', 'public', 'commentaries', 'jhn', '1.json');
const entries = loadJohn1Entries(file); // null = the gitignored corpus is absent (CI)

const SKIP = announceSkip(
  'marketing verse-panel demo sync',
  [{
    name: 'web/public/commentaries/jhn/1.json (gitignored static corpus)',
    present: entries !== null,
    kind: 'artifact',
  }],
  'a marketing excerpt drifting from the verbatim served corpus text, or naming an unserved author',
);

describe.skipIf(SKIP)('marketing verse-panel demo — every excerpt is verbatim served corpus text', () => {
  it('ten distinct voices, every excerpt verbatim from a served John 1:1 entry', () => {
    // toEqual([]) so a failure PRINTS the findings — each names its voice and its leg.
    expect(marketingVersePanelFindings(VERSE_PANEL_VOICES, entries ?? [])).toEqual([]);
  });
});
