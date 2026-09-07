// newman-apologia gutenberg profile (PROFILES['newman-apologia'] in adapter-gutenberg).
//
// PG #22088 is the 1890 Longmans edition of Newman's 1864 Apologia pro Vita Sua.
// The plain text carries the title page, the 1865 Preface, a CONTENTS list whose
// bare "CHAPTER I.".. lines would pre-match a naive chapter split, then the work
// proper — a part-title "MY RELIGIOUS OPINIONS." followed by five two-line chapter
// headings ("CHAPTER I." / "HISTORY OF MY RELIGIOUS OPINIONS TO THE YEAR 1833.")
// — and finally the back matter: "NOTES." (Notes A–G), the saints' calendar, the
// approbation letters, and the publisher's "CARDINAL NEWMAN'S WORKS." catalog.
//
// The profile therefore uses the scoped-contents spec (the donne/herrick shape):
// scope is the part-title to "NOTES.", and the contents are the edition's own five
// chapter-heading lines, walked in order — a missing one aborts as structure drift.
// The descriptive title line stays as the body's first line, exactly as the edition
// prints it. register is 'prose' (a theology narrative, not verse).

import { describe, expect, it } from 'vitest';
import { buildSections, scopedSections, PROFILES } from '../src/ingest/adapter-gutenberg.js';

// Shape taken from pg22088.txt: blank-separated heading lines, the descriptive
// title one blank line under each "CHAPTER n." line, then the back-matter run.
const APOLOGIA = `
APOLOGIA PRO VITA SUA

PREFACE.

The following History of my Religious Opinions, now that it is detached from
the context in which it originally stood, requires some preliminary explanation.

CONTENTS.

CHAPTER I.

CHAPTER II.

MY RELIGIOUS OPINIONS.

CHAPTER I.

HISTORY OF MY RELIGIOUS OPINIONS TO THE YEAR 1833.

It may easily be conceived how great a trial it is to me to write the
following history of myself; but I must not shrink from the task at hand.

CHAPTER II.

HISTORY OF MY RELIGIOUS OPINIONS FROM 1833 TO 1839.

In spite of the foregoing pages, I have no romantic story to tell; but I
have written them, because it is my duty to tell things as they took place.

CHAPTER III.

HISTORY OF MY RELIGIOUS OPINIONS FROM 1839 TO 1841.

And now I am brought to the time when I began to be influenced by the
great events that were then agitating the religious world around me.

CHAPTER IV.

HISTORY OF MY RELIGIOUS OPINIONS FROM 1841 TO 1845.

From the time that I had begun to occupy the attention of the public,
I had been made the subject of much misrepresentation and reproach.

CHAPTER V.

POSITION OF MY MIND SINCE 1845.

I have now arrived at the close of my narrative; and the only thing that
remains is to sum up in few words the position of my mind since that year.

NOTES.

NOTE A. ON PAGE 14.

LIBERALISM.

I have been asked to explain more fully what it is I mean by "Liberalism,"
because merely to call it the Anti-dogmatic Principle is to tell very little.

CARDINAL NEWMAN'S WORKS.

1. SERMONS.

Parochial and Plain Sermons, cloth, price five shillings per volume.
`;

describe('PROFILES[newman-apologia]', () => {
  const profile = PROFILES['newman-apologia'];

  it('the profile exists and is prose-register scoped', () => {
    // RED-PROOF: pre-profile this is undefined and every test below fails with it.
    expect(profile).toBeDefined();
    expect(profile!.register).toBe('prose');
    expect(profile!.sections).toBeDefined();
  });

  it('yields the five chapters, headed by the edition’s own chapter lines', () => {
    const secs = buildSections(APOLOGIA, profile!);
    expect(secs.map((s) => s.heading)).toEqual(['CHAPTER I.', 'CHAPTER II.', 'CHAPTER III.', 'CHAPTER IV.', 'CHAPTER V.']);
    // the descriptive title line opens each chapter body, as the edition prints it
    expect(secs[0]!.body).toContain('HISTORY OF MY RELIGIOUS OPINIONS TO THE YEAR 1833.');
    expect(secs[0]!.body).toContain('It may easily be conceived how great a trial');
    expect(secs[4]!.body).toContain('POSITION OF MY MIND SINCE 1845.');
  });

  it('CONTROL — the ToC chapter lines before the part-title never pre-match', () => {
    // A naive "first CHAPTER I. line" split would land inside CONTENTS; the
    // scope start (the unique part-title) makes that impossible.
    const secs = buildSections(APOLOGIA, profile!);
    expect(secs).toHaveLength(5);
    expect(secs[0]!.body).not.toContain('PREFACE');
  });

  it('CONTROL — back matter at NOTES. never rides in', () => {
    const secs = buildSections(APOLOGIA, profile!);
    const all = secs.map((s) => `${s.heading}\n${s.body}`).join('\n');
    expect(all).not.toContain('LIBERALISM');
    expect(all).not.toContain("CARDINAL NEWMAN'S WORKS");
  });

  it('FAIL CLOSED — a missing declared chapter aborts as structure drift', () => {
    const drifted = APOLOGIA.replace('CHAPTER IV.\n', '');
    expect(() => scopedSections(drifted, profile!.sections!)).toThrow(/structure drift/);
  });

  it('FAIL CLOSED — a text without the part-title is refused at the scope start', () => {
    expect(() => scopedSections('CHAPTER I.\n\nSome body text without the title.', profile!.sections!)).toThrow(/scope start/);
  });
});
