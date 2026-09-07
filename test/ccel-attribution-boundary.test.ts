// ADR-029 durable repair (Track A, 2026-09-06 order): the per-work attribution boundary
// inside the CCEL adapter. Addendum 1 ruled the adapter fix "must land before any further
// CCEL ingest"; addendum 2 widened the class to ANY non-authorial matter. The adapter must
// surface detected non-authorial matter AT INGEST TIME — flag/hold with a reason — never
// carry it silently under the declared author. No ordinal surgery: the boundary HOLDS the
// work; it never trims or deletes a section.
import { describe, expect, it } from 'vitest';
import * as adapter from '../src/ingest/adapter-ccel';

const buildCcelSections = (adapter as any).buildCcelSections as (xml: string) => Array<{ heading?: string; body: string }>;
const attributionBoundaryHold: any = (adapter as any).attributionBoundaryHold;

// A composite ThML volume in the ANF shape: 1 Clement bound in front of Origen's
// Commentary on John — the §1 banner carries the print rule line, exactly as the staged
// origen-commentary does in dev.
const COMPOSITE_XML = `<ThML><body>
<div2 title="The Salutation. Praise of the Corinthians Before the Breaking Forth of Schism Among Them.">
<p>The First Epistle of Clement to the Corinthians. ————————————</p>
<p>Chapter I.—The Salutation. The church of God which sojourns at Rome, to the church of God
sojourning at Corinth, to them that are called and sanctified by the will of God, through our
Lord Jesus Christ: Grace unto you, and peace, from Almighty God through Jesus Christ, be multiplied.</p>
</div2>
<div2 title="How Christians are the Spiritual Israel.">
<p>Origen's Commentary on the Gospel of John. ————————————</p>
<p>Book I. 1. That people which was called of old the people of God was divided into twelve
tribes, and over and above the other tribes it had the levitical order, which itself again
carried on the service of God in various priestly and levitical suborders.</p>
</div2>
<div2 title="The 144,000 Sealed in the Apocalypse are Converts to Christ from the Gentile World.">
<p>These, then, who are sealed on their foreheads from every tribe of the children of Israel,
are a hundred and forty-four thousand in number; and we must consider what is meant by the
sealing, and who they are that are sealed.</p>
</div2>
</body></ThML>`;

const CLEAN_XML = `<ThML><body>
<div2 title="How Christians are the Spiritual Israel.">
<p>Origen's Commentary on the Gospel of John. ————————————</p>
<p>Book I. 1. That people which was called of old the people of God was divided into twelve
tribes, and over and above the other tribes it had the levitical order.</p>
</div2>
<div2 title="The 144,000 Sealed in the Apocalypse are Converts to Christ from the Gentile World.">
<p>These, then, who are sealed on their foreheads from every tribe of the children of Israel,
are a hundred and forty-four thousand in number.</p>
</div2>
<div2 title="In the Spiritual Israel the High-Priests are Those Who Devote Themselves to the Study of Scripture.">
<p>What the high-priest was among the Jews, that is every one among us who rightly divides
the word of truth and offers it up to God.</p>
</div2>
</body></ThML>`;

describe('the CCEL attribution boundary (ADR-029 durable repair)', () => {
  it('HOLDS a composite volume — 1 Clement bound in under Origen', () => {
    const sections = buildCcelSections(COMPOSITE_XML);
    expect(sections.length).toBeGreaterThanOrEqual(3); // the parse itself is fine; the boundary is the gate
    const hold = attributionBoundaryHold(sections, 'Origen of Alexandria');
    expect(hold.held).toBe(true);
    expect(hold.reason).toMatch(/held — non-authorial matter/);
    expect(hold.reason).toMatch(/foreign-work-banner/);
    expect(hold.reason).toMatch(/Clement/);
  });

  it('does NOT hold a clean work — the genuine Origen units pass', () => {
    const sections = buildCcelSections(CLEAN_XML);
    const hold = attributionBoundaryHold(sections, 'Origen of Alexandria');
    expect(hold.held).toBe(false);
    expect(hold.reason).toBeNull();
  });

  it('HOLDS a work carrying a machine word index the heading filter misses', () => {
    // MATTER_RE drops "Greek Words"/"Hebrew Words" headings but not "Latin Words and
    // Phrases" — the exact gap that carried 929 index rows into published works.
    const sections = [
      { heading: 'Chapter I.', body: 'The word was in the beginning, and the word was with God, and the word was God; the same was in the beginning with God.' },
      { heading: 'Chapter II.', body: 'All things were made by him, and without him was not any thing made that was made. In him was life.' },
      { heading: 'Chapter III.', body: 'There was a man sent from God, whose name was John. The same came for a witness of the light.' },
      { heading: 'Latin Words and Phrases', body: 'Index of Latin Words and Phrases\nAdhuc sub judice lis est:\n1\nArmorum superi:\n1\nCertatur:\n1' },
    ];
    const hold = attributionBoundaryHold(sections, 'John Owen');
    expect(hold.held).toBe(true);
    expect(hold.reason).toMatch(/word-index-title/);
  });

  it('does NOT hold the content ADR-029 ruled genuine (the kept negative)', () => {
    const sections = [
      { heading: 'Chapter I.', body: 'The word was in the beginning, and the word was with God, and the word was God; the same was in the beginning with God.' },
      { heading: 'Chapter II.', body: 'All things were made by him, and without him was not any thing made that was made. In him was life.' },
      { heading: 'Chapter III.', body: 'There was a man sent from God, whose name was John. The same came for a witness of the light.' },
      {
        heading: "Comparative Table of the Ante-Nicene Rules of Faith as related to the Apostles' Creed and the Nicene Creed.",
        body: "The Apostles' Creed. (Rome.) About A.D. 340. I believe in God the Father Almighty, Maker of heaven and earth; and in Jesus Christ, His only Son, our Lord.",
      },
    ];
    const hold = attributionBoundaryHold(sections, 'Philip Schaff');
    expect(hold.held).toBe(false);
  });

  it('weak findings are reported but do NOT hold (owner decision #4 stays open)', () => {
    // A heading naming another work with no print rule line — Foxe's own chapter shape.
    const sections = [
      { heading: 'Chapter I.', body: 'The word was in the beginning, and the word was with God, and the word was God; the same was in the beginning with God.' },
      { heading: 'Chapter II.', body: 'All things were made by him, and without him was not any thing made that was made. In him was life.' },
      { heading: 'Chapter III.', body: 'There was a man sent from God, whose name was John. The same came for a witness of the light.' },
      { heading: 'An Account of the Inquisition — The Life of William Gardiner', body: 'William Gardiner was born at Bristol, received a tolerable education, and was, at a proper age, placed at a merchant\'s office.' },
    ];
    const hold = attributionBoundaryHold(sections, 'John Foxe');
    expect(hold.held).toBe(false);
    expect(hold.matter.weak).toBeGreaterThan(0); // reported for reading, not held
  });
});
