// PROPERTY (Work Order v2 Stage 3.2): no served commentary entry keyed to a verse is book- or
// chapter-level apparatus — a Preface, Introduction, Argument, Contents, Dedication or Title
// Page that ingest gave a verse key because printed front matter has none.
//
// The two halves of this suite carry equal weight. The detector must FIRE on apparatus, and it
// must NOT fire on real exposition that talks about a preface, or on the content ADR-029
// explicitly ruled genuine. A detector with false positives gets switched off, and then the
// property is unguarded while looking guarded.
import { describe, expect, it } from 'vitest';
import {
  frontMatterVerdict,
  frontMatterVerdictSummary,
  isStub,
  scanEntries,
  titleLine,
} from '../scripts/lib/front-matter-detector.mjs';

const apparatus = (body: string, heading?: string) => frontMatterVerdict({ body, heading });

describe('the detector fires on book/chapter apparatus', () => {
  // The seed the work order names by name.
  it('"Preface to the Gospel of John" keyed at John 1:1 is apparatus, and STRONG', () => {
    const v = apparatus('Preface to the Gospel of John\n\nThe fourth Gospel differs from the others in that…');
    expect(v.apparatus).toBe(true);
    expect(v.kind).toBe('apparatus-title');
    expect(v.strength).toBe('strong');
    expect(v.evidence).toContain('Preface to the Gospel of John');
  });

  it.each([
    ['Preface', 'Preface\n\nThe present volume is offered to the reader…'],
    ['THE ARGUMENT', 'THE ARGUMENT.\n\nPaul, having been called an apostle…'],
    ['Introduction', 'Introduction\n\nOf the writer of this epistle little is known…'],
    ['Contents', 'Contents:\nChapter I. The Word made flesh\nChapter II…'],
    ['Table of Contents', 'Table of Contents\n1. The Word\n2. The Light'],
    ['Dedication', 'Dedication — To the Right Honourable the Earl of Warwick'],
    ['Title Page', 'Title Page\n\nAn Exposition of the Gospel according to St John'],
    ['Prolegomena', 'Prolegomena.\n\nThe life and times of the author…'],
    ['To the Reader', 'To the Reader\n\nGentle reader, this work was begun…'],
    ['scoped introduction', 'Introduction to the First Epistle of Peter\n\nPeter writes to the elect…'],
    ['dedicatory epistle', 'The Epistle Dedicatory\n\nTo the most high and mighty Prince…'],
  ])('%s is apparatus', (_label, body) => {
    expect(frontMatterVerdict({ body }).apparatus).toBe(true);
  });

  it('a roman-numeral-only body is apparatus — a contents or pagination fragment', () => {
    expect(apparatus('XIV.').kind).toBe('roman-numeral-body');
    expect(apparatus('I. II. III. IV.').kind).toBe('roman-numeral-body');
    expect(apparatus('— xxi —').kind).toBe('roman-numeral-body');
  });

  it('an apparatus HEADING is apparatus even when the body reads like prose', () => {
    // The reader shows the heading and ingest keyed both to the verse, so the heading decides.
    const v = frontMatterVerdict({
      heading: 'Introduction',
      body: 'Now the Gospel of John was written last of all, as Eusebius reports, at the request of the brethren in Asia.',
    });
    expect(v.apparatus).toBe(true);
    expect(v.kind).toBe('apparatus-title');
  });
});

describe('the detector does NOT fire on exposition', () => {
  it.each([
    ['prose mentioning a preface', 'In this preface Paul lays out the theme of the whole epistle, which is righteousness by faith.'],
    ['prose mentioning an introduction', 'The introduction of the Word as pre-existent is the burden of these first verses.'],
    ['prose mentioning an argument', "The argument of the apostle here is drawn from the nature of God's promise to Abraham."],
    ['prose beginning with a verse quote', 'In the beginning - That is, before any thing was formed - ere God began the great work of creation.'],
    ['a real exposition with contents in it', 'The contents of this chapter are threefold: the Word, the witness, and the world.'],
  ])('%s is not apparatus', (_label, body) => {
    expect(frontMatterVerdict({ body }).apparatus).toBe(false);
  });

  // ADR-029 read these bodies and ruled them genuine. If this detector calls them apparatus it
  // is contradicting a decision made by reading the text, and it is the detector that is wrong.
  it('does not fire on the content ADR-029 ruled genuine', () => {
    expect(
      frontMatterVerdict({
        heading: 'Comparative Table of the Ante-Nicene Rules of Faith',
        body: 'The Apostles\u2019 Creed. I believe in God the Father Almighty…',
      }).apparatus,
    ).toBe(false);
    expect(
      frontMatterVerdict({ heading: 'General Index of Chapters', body: 'Book I. Of the knowledge of God…' }).apparatus,
    ).toBe(false);
  });

  // The two false positives the FIRST real run produced, over the 191,749 shipping entries.
  // Both were reported as admitted violations; reading the bodies showed both were real content
  // with apt verse keys. They are kept here as fixtures so the distinction cannot quietly regress.
  it('does not STOP on a label that names its SUBJECT rather than a volume', () => {
    const schaff = frontMatterVerdict({
      body:
        'The Argument for the Immaculate Conception.\n\n§ 29. The Argument for the Immaculate Conception.\n\n' +
        'The importance of the subject justifies and demands a brief examination of the arguments in favor of this novel dogma…',
    });
    // Genuine polemical scholarship (Creeds of Christendom §29), keyed at Genesis 3:15 — the
    // passage actually adduced for the dogma. The key is APT.
    expect(schaff.apparatus).toBe(true);
    expect(schaff.strength, 'a subject-named argument must not stop a build').toBe('weak');

    const watson = frontMatterVerdict({
      body: "The Preface to the Lord's Prayer\n\n‘Our Father which art in Heaven’\n\nHaving gone over the chief grounds of religion…",
    });
    // An exposition of the prayer's own preface, keyed at Matthew 6:9 — which IS "Our Father
    // which art in heaven".
    expect(watson.strength).toBe('weak');
  });

  it('a bare label and a volume-scoped label both stay STRONG', () => {
    expect(apparatus('The Preface\n\nThe disciples of our Lord Jesus Christ having made that great confession…').strength).toBe('strong');
    expect(apparatus('Argument.\n\nHomilies of St. John Chrysostom, archbishop of Constantinople…').strength).toBe('strong');
    expect(apparatus('The Epistle Dedicatory\n\nTo the Worshipful John Upton of Lupton, Esq…').strength).toBe('strong');
    expect(apparatus('Preface to the Second Edition\n\nThis volume has been revised…').strength).toBe('strong');
  });

  it('does not fire on a long body that merely happens to be numeral-heavy', () => {
    const long = 'i. '.repeat(80);
    expect(frontMatterVerdict({ body: long }).apparatus).toBe(false);
  });

  it('an empty entry is not a finding', () => {
    expect(frontMatterVerdict({}).apparatus).toBe(false);
    expect(frontMatterVerdict({ body: '' }).apparatus).toBe(false);
    expect(frontMatterVerdict({ body: '   \n  ' }).apparatus).toBe(false);
  });
});

describe('titleLine reads the heading, else the first non-empty line', () => {
  it('prefers an explicit heading', () => {
    expect(titleLine({ heading: 'Preface', body: 'In the beginning…' })).toBe('Preface');
  });

  it('skips leading blank lines in a body', () => {
    expect(titleLine({ body: '\n\n  THE ARGUMENT.\n\nPaul…' })).toBe('THE ARGUMENT.');
  });
});

describe('stubs are reported apart from apparatus', () => {
  it('a very short body is a stub, not an apparatus finding', () => {
    expect(isStub({ body: 'See above.' })).toBe(true);
    expect(frontMatterVerdict({ body: 'See above.' }).apparatus).toBe(false);
  });

  it('a full exposition is not a stub', () => {
    expect(isStub({ body: 'In the beginning - That is, before any thing was formed by God.' })).toBe(false);
  });
});

describe('the scan STOPS on apparatus that a reader can reach', () => {
  const served = (e: { author?: string }) => e.author === 'John Calvin';
  const rows = [
    { author: 'John Calvin', body: 'In the beginning - the evangelist speaks of the eternal Word.' },
    { author: 'John Calvin', body: 'Preface to the Gospel of John\n\nThe fourth Gospel…' },
    { author: 'Origen of Alexandria', body: 'Introduction\n\nOn the four Gospels…' },
  ];

  it('counts hits, separates admitted ones, and stops', () => {
    const scan = scanEntries(rows, { served });
    expect(scan.scanned).toBe(3);
    expect(scan.hits).toHaveLength(2);
    expect(scan.admittedHits).toHaveLength(1);
    expect(scan.admittedStrongHits).toHaveLength(1);
    expect(scan.byKind['apparatus-title']).toBe(2);

    const verdict = frontMatterVerdictSummary(scan);
    expect(verdict.stop).toBe(true);
    expect(verdict.reason).toMatch(/1 SERVED entry is book\/chapter apparatus/);
  });

  it('a WEAK admitted hit is reported but does not stop the build', () => {
    const scan = scanEntries(
      [{ author: 'John Calvin', body: "The Preface to the Lord's Prayer\n\n‘Our Father which art in Heaven’\n\nHaving gone over…" }],
      { served },
    );
    expect(scan.admittedHits).toHaveLength(1);
    expect(scan.admittedStrongHits).toHaveLength(0);
    expect(scan.admittedWeakHits).toHaveLength(1);
    expect(frontMatterVerdictSummary(scan).stop).toBe(false);
  });

  it('apparatus in an UNSERVED work is recorded but does not stop the build', () => {
    const scan = scanEntries([rows[0]!, rows[2]!], { served });
    expect(scan.hits).toHaveLength(1);
    expect(scan.admittedHits).toHaveLength(0);
    expect(frontMatterVerdictSummary(scan).stop).toBe(false);
  });

  it('a scan that examined NOTHING stops — zero of zero is not a clean result', () => {
    // Every broken scan has this shape: wrong path, wrong filter, empty query. Green here would
    // be the most dangerous output the tool can produce, because it looks like success.
    const verdict = frontMatterVerdictSummary(scanEntries([], { served }));
    expect(verdict.stop).toBe(true);
    expect(verdict.reason).toMatch(/VACUOUS/);
  });

  it('admission is INJECTED, so the report cannot disagree with the product', () => {
    // Same rows, a predicate that serves everything: the admitted count must follow the
    // predicate rather than anything the detector believes about authors.
    const scan = scanEntries(rows, { served: () => true });
    expect(scan.admittedHits).toHaveLength(2);
  });
});
