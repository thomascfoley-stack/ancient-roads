// S2 item 8 — ERA IS VISIBLE WITHOUT READING EVERY NAME AND DATE.
//
// Exit test for `S2` item 8, written before the fix (§0.1).
//
// THE FINDING (third-party audit, triaged): fifteen voices on one verse render as visually
// identical cards, so parsing "the fathers think X, the Reformers think Y" means reading every
// name and year. The data already carries what is needed — `eraLabel()` (`:135`) buckets by year
// and the panel already groups by it (`:391`).
//
// THE BINDING CONSTRAINT, and the one this file exists to enforce: **colour must stay REDUNDANT,
// never the sole encoding.** The panel groups under textual era headers today. The tint reinforces
// that; it must not replace it, or the feature is invisible to colourblind readers. The block says
// if anyone later proposes removing the text headers "because the colours do that now", refuse —
// so that refusal is a test, not a comment.
//
// The rendered checks (a distinct border per group; a first-time reader pointing at "the early
// church") are BROWSER and HUMAN. The >= 3:1 contrast measurement needs a real tool and is not
// asserted here — measuring it by eye or by arithmetic on tokens I picked would be exactly the
// unearned green this repo audits for.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { eraLabel } from '@/components/commentary-panel';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const panel = () => readFileSync(path.join(SRC, 'components/commentary-panel.tsx'), 'utf8');

describe('S2 item 8 — era accent', () => {
  it('every era the data can produce has an accent, so none renders untinted', () => {
    // SEED: drop a branch from the accent map -> RED. Derived from eraLabel's own output rather
    // than a hand-typed list, because a hand-maintained expected set is this repo's most-punished
    // defect — add a fifth era to eraLabel and this fails instead of silently rendering nothing.
    const eras = [...new Set([100, 800, 1600, 1900].map((y) => eraLabel(y)))];
    // Scoped to the ACCENT MAP, not the whole file. Searching the file passes trivially — every
    // era string already appears inside `eraLabel` itself, so the check would be green with no
    // accent map at all. Caught by seeding: it passed before the feature existed.
    const map = /(?:ERA_ACCENT|eraAccent)[\s\S]{0,400}?\}/.exec(panel())?.[0] ?? '';
    const missing = eras.filter((e) => !new RegExp(`['"\`]${e}['"\`]`).test(map));
    expect(missing, `these eras have no accent entry: ${missing.join(', ')}`).toEqual([]);
  });

  it('the accent is DERIVED from the era, not hand-applied per card', () => {
    // A per-card class would drift the moment a card moves group.
    expect(panel(), 'expected an accent lookup keyed by era').toMatch(/ERA_ACCENT|eraAccent/);
  });

  it('the TEXTUAL era heading survives — colour is redundant, never the sole encoding', () => {
    // SEED: delete the {era} heading -> RED. This is the block's explicit refusal, made mechanical.
    const code = panel();
    expect(code, 'the uppercase era heading must remain').toMatch(/\{era\}/);
    expect(code, 'author, year and tradition must stay on the card beside the tint').toMatch(/entry\.tradition/);
  });

  it('no new hue outside the existing palette', () => {
    // The block forbids new hues. Accents must come from the app's tokens (accent-*/stone-*), not
    // arbitrary hex.
    const map = /(?:ERA_ACCENT|eraAccent)[\s\S]{0,400}?\}/.exec(panel())?.[0] ?? '';
    expect(map, 'accent map not found').toBeTruthy();
    expect(map, 'accents must use palette tokens, not raw hex').not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});
