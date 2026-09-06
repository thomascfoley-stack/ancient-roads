// luther-works1 / luther-works2 gutenberg profiles (PROFILES in adapter-gutenberg).
//
// PG #31604 / #34904 are the Holman "Works of Martin Luther, with Introductions
// and Notes" vols I (1915) and II (1916) — the Philadelphia edition. Each volume
// is a collection of treatises, and every treatise is printed THREE times in the
// plain text: an indented CONTENTS line, a flush part-title block, and — after
// the Holman editor's INTRODUCTION — the translation itself under a heading that
// is sometimes identical to the part-title (vol II's first three treatises),
// sometimes different ("A PRELUDE ON THE BABYLONIAN CAPTIVITY…" → "THE
// BABYLONIAN CAPTIVITY OF THE CHURCH"). The editors' introductions are NOT
// Luther and must never serve under his name.
//
// The profiles therefore use the scoped-contents spec with marker entries: each
// treatise declares its part-title as a `marker` boundary (consuming the first
// occurrence and everything the editor wrote after it) and its translation
// heading as the section — walked in order, so an identical part-title can never
// be mistaken for the translation, and a missing declared piece aborts as
// structure drift. Back matter ends at the INDEX line.

import { describe, expect, it } from 'vitest';
import { buildSections, scopedSections, PROFILES } from '../src/ingest/adapter-gutenberg.js';

// Shape taken from pg31604.txt: indented CONTENTS lines, flush part-title
// blocks, an editor INTRODUCTION per treatise, then the translation heading.
const VOL1 = `
WORKS OF MARTIN LUTHER

CONTENTS

LUTHER'S PREFACES (C. M. Jacobs)
DISPUTATION ON INDULGENCES (1517)
TREATISE ON BAPTISM (1519)
DISCUSSION OF CONFESSION (1520)

INTRODUCTION

No historical study of current issues can far proceed without bringing the
student face to face with the principles asserted by the Reformation.

SELECTIONS FROM LUTHER'S PREFACES TO HIS WORKS 1539 and 1545

I

LUTHER'S PREFACE TO THE FIRST PART OF HIS GERMAN WORKS[1]

I would not have the reader mistake me, as those do who read my books and
think that they know all when they have read a page or two of my writings.

THE DISPUTATION OF DOCTOR MARTIN LUTHER
ON THE POWER AND EFFICACY OF INDULGENCES
(THE NINETY-FIVE THESES)

INTRODUCTION

"A Disputation of the Power and Efficacy of Indulgences" is the full title of
the document commonly called "The Ninety-five Theses," says the editor.

DISPUTATION OF DOCTOR MARTIN LUTHER ON THE POWER AND EFFICACY OF
INDULGENCES

OCTOBER 31, 1517

Out of love for the truth and the desire to bring it to light, the following
propositions will be discussed at Wittenberg, under the presidency of the
Reverend Father Martin Luther.

A TREATISE ON THE HOLY SACRAMENT OF BAPTISM

INTRODUCTION

The editor explains that this treatise was written in 1519, when Luther was
still hopeful of reform within the Church.

A TREATISE ON BAPTISM

[Sidenote: Meaning of the Word]

I. Baptism is called in the Greek language baptismos, in Latin mersio, which
means to plunge something entirely into the water, so that the water closes
over it.

A DISCUSSION OF CONFESSION
(CONFITENDI RATIO)
1520

INTRODUCTION

The Confitendi Ratio is the culmination of a series of tracts, the editor
writes, published after the memorable October 31st, 1517.

A DISCUSSION OF CONFESSION

Every Christian should know that confession was instituted neither by the
church nor by any human being, but is grounded in the Word of God alone.

THE FOURTEEN OF CONSOLATION

INTRODUCTION

The editor places the Fourteen among the devotional writings of 1520.

THE FOURTEEN OF CONSOLATION

To the sufferer Luther writes: there are three things in every temptation,
the temptation itself, the consolation, and the fruit of the consolation.

A TREATISE ON GOOD WORKS,

INTRODUCTION

The editor calls this the greatest of the ethical treatises of 1520.

A TREATISE ON GOOD WORKS

1520

The first and highest of all good works is faith in Christ, as He Himself
says in John the sixth: this is the work of God, that ye believe on Him.

A TREATISE ON THE NEW TESTAMENT

INTRODUCTION

The editor explains what Luther meant by the New Testament in this treatise.

A TREATISE ON THE NEW TESTAMENT,

THAT IS THE HOLY MASS

1519

The New Testament, that is, the holy mass, is the last will and testament of
Christ, in which He bequeathed to us the forgiveness of sins.

THE PAPACY AT ROME

INTRODUCTION

The editor traces the Leipzig debate and the Romanist Eck's attack.

TO THE PAPACY AT ROME

AN ANSWER TO THE CELEBRATED ROMANIST AT LEIPZIG[1]

1520

After all these years of fruitful rain and abundant growth something new has
appeared on the scene: the brave heroes at Leipzig on the market-place.

INDEX

SCRIPTURE REFERENCES

Genesis 3:15 — the seed of the woman shall bruise the serpent's head, an
index entry that must never ride into the treatise bodies.
`;

// Shape taken from pg34904.txt: the part-title and the translation heading are
// IDENTICAL whole lines for the first treatises; only in-order walking with a
// marker keeps the editor's INTRODUCTION out.
const VOL2 = `
WORKS OF MARTIN LUTHER

CONTENTS

    A TREATISE CONCERNING THE BLESSED SACRAMENT
          AND CONCERNING THE BROTHERHOODS (1519).
    A TREATISE CONCERNING THE BAN (1520).

A TREATISE CONCERNING THE BLESSED SACRAMENT OF THE HOLY AND TRUE BODY
OF CHRIST AND CONCERNING THE BROTHERHOODS

1519

INTRODUCTION

The editor writes at length about the sacramental controversies of the year
1519 and the place of this treatise among them.

A TREATISE CONCERNING THE BLESSED SACRAMENT OF THE HOLY AND TRUE BODY
OF CHRIST AND CONCERNING THE BROTHERHOODS

1519

In the first place, the holy sacrament of the altar, or the mass, is a truly
great and wonderful treasure of the Christian Church, instituted by Christ.

A TREATISE CONCERNING THE BAN

1520

INTRODUCTION

The editor introduces the little treatise on the ban and its history.

A TREATISE CONCERNING THE BAN

1520

Dear friend, you ask me whether the ban, that is, excommunication, is to be
feared, and what we are to think of it; I will answer as God gives me grace.

AN OPEN LETTER TO THE CHRISTIAN NOBILITY OF THE GERMAN NATION
CONCERNING THE REFORM OF THE CHRISTIAN ESTATE

1520

INTRODUCTION

The editor recounts the composition of the Address to the Nobility in the
summer of 1520 and its enormous effect.

AN OPEN LETTER TO THE CHRISTIAN NOBILITY OF THE GERMAN NATION
CONCERNING THE REFORM OF THE CHRISTIAN ESTATE

1520

To the Most Illustrious and Mighty Imperial Majesty, and to the Christian
Nobility of the German Nation, from Dr. Martin Luther: grace and strength.

A PRELUDE ON THE BABYLONIAN CAPTIVITY OF THE CHURCH

1520

INTRODUCTION

The editor explains the occasion of the Prelude and its publication.

THE BABYLONIAN CAPTIVITY OF THE CHURCH

1520

JESUS

Martin Luther, Augustinian, to his friend, Herman Tulich, sends greeting:
whether I will or no, I am forced to become more learned every day.

A TREATISE ON CHRISTIAN LIBERTY WITH A LETTER TO POPE LEO X

1520

INTRODUCTION

The editor weighs the Letter to Leo X against the treatise it accompanies.

A TREATISE ON CHRISTIAN LIBERTY

[Sidenote: Faith]

Many have thought Christian faith to be an easy thing, and not a few have
reckoned it among the works; but faith alone justifies, says Luther.

A BRIEF EXPLANATION (EINE KURZE FORM) OF THE TEN COMMANDMENTS, THE
CREED, AND THE LORD'S PRAYER

1520

INTRODUCTION

The editor describes the Kurze Form and its rediscovery at Mount Holly.

A BRIEF EXPLANATION OF THE TEN COMMANDMENTS, THE CREED, AND THE LORD'S
PRAYER

1520

I believe in God the Father Almighty, Maker of heaven and earth: the first
article of the Creed, expounded here in Luther's own brief form.

THE EIGHT WITTENBERG SERMONS

1522

INTRODUCTION

After the bold utterance of unshaken conviction at the Diet of Worms Luther
disappeared from the scene of his activities, the editor narrates.

EIGHT SERMONS BY DR. MARTIN LUTHER

Preached at Wittenberg in Lent, 1522

THE FIRST SERMON

INVOCAVIT SUNDAY

The challenge of death comes to us all, and no one can die for another.
Every one must fight his own battle with death by himself, alone.

THAT DOCTRINES OF MEN ARE TO BE REJECTED

1522

INTRODUCTION

The editor traces the origin of the treatise to the Wartburg months.

THAT WE ARE TO REJECT THE DOCTRINES OF MEN:

That the doctrines of men are to be rejected, together with a reply to texts
quoted in defence of the doctrines of men, is Luther's answer to Faber.

INDEX

SCRIPTURE REFERENCES

Matthew 15:9 — in vain do they worship me, an index entry, not treatise text.
`;

describe('PROFILES[luther-works1]', () => {
  const profile = PROFILES['luther-works1'];

  it('the profile exists and is prose-register scoped', () => {
    // RED-PROOF: pre-profile this is undefined and every test below fails with it.
    expect(profile).toBeDefined();
    expect(profile!.register).toBe('prose');
    expect(profile!.sections).toBeDefined();
  });

  it('yields the treatise translations, not the part-titles', () => {
    const secs = buildSections(VOL1, profile!);
    expect(secs.map((s) => s.heading)).toEqual([
      "SELECTIONS FROM LUTHER'S PREFACES TO HIS WORKS 1539 and 1545",
      'DISPUTATION OF DOCTOR MARTIN LUTHER ON THE POWER AND EFFICACY OF INDULGENCES',
      'A TREATISE ON BAPTISM',
      'A DISCUSSION OF CONFESSION',
      'THE FOURTEEN OF CONSOLATION',
      'A TREATISE ON GOOD WORKS',
      'A TREATISE ON THE NEW TESTAMENT,',
      'TO THE PAPACY AT ROME',
    ]);
    expect(secs[1]!.body).toContain('Out of love for the truth');
    expect(secs[2]!.body).toContain('baptismos');
  });

  it('CONTROL — the editors’ INTRODUCTIONs never serve under Luther’s name', () => {
    const secs = buildSections(VOL1, profile!);
    const all = secs.map((s) => `${s.heading}\n${s.body}`).join('\n');
    expect(all).not.toContain('says the editor');
    expect(all).not.toContain('The editor explains');
    expect(all).not.toContain('the editor writes');
    expect(all).not.toContain('No historical study of current issues');
  });

  it('CONTROL — the CONTENTS list never pre-matches a treatise heading', () => {
    // "DISPUTATION ON INDULGENCES (1517)" and friends sit before the part-title;
    // anchored whole-line matches make them inert.
    const secs = buildSections(VOL1, profile!);
    expect(secs).toHaveLength(8);
    expect(secs[0]!.heading).toContain('PREFACES');
  });

  it('CONTROL — back matter at INDEX never rides in', () => {
    const secs = buildSections(VOL1, profile!);
    const all = secs.map((s) => `${s.heading}\n${s.body}`).join('\n');
    expect(all).not.toContain("bruise the serpent's head");
  });

  it('FAIL CLOSED — a missing declared translation aborts as structure drift', () => {
    const drifted = VOL1.replace('A TREATISE ON BAPTISM\n', '');
    expect(() => scopedSections(drifted, profile!.sections!)).toThrow(/structure drift/);
  });

  it('FAIL CLOSED — a text without the prefaces heading is refused at the scope start', () => {
    expect(() => scopedSections('A TREATISE ON BAPTISM\n\nSome body text.', profile!.sections!)).toThrow(/scope start/);
  });
});

describe('PROFILES[luther-works2]', () => {
  const profile = PROFILES['luther-works2'];

  it('the profile exists and is prose-register scoped', () => {
    expect(profile).toBeDefined();
    expect(profile!.register).toBe('prose');
    expect(profile!.sections).toBeDefined();
  });

  it('yields the treatise translations, with identical part-titles consumed as markers', () => {
    const secs = buildSections(VOL2, profile!);
    expect(secs.map((s) => s.heading)).toEqual([
      'A TREATISE CONCERNING THE BLESSED SACRAMENT OF THE HOLY AND TRUE BODY OF CHRIST AND CONCERNING THE BROTHERHOODS',
      'A TREATISE CONCERNING THE BAN',
      'AN OPEN LETTER TO THE CHRISTIAN NOBILITY OF THE GERMAN NATION CONCERNING THE REFORM OF THE CHRISTIAN ESTATE',
      'THE BABYLONIAN CAPTIVITY OF THE CHURCH',
      'A TREATISE ON CHRISTIAN LIBERTY',
      "A BRIEF EXPLANATION OF THE TEN COMMANDMENTS, THE CREED, AND THE LORD'S PRAYER",
      'EIGHT SERMONS BY DR. MARTIN LUTHER',
      'THAT WE ARE TO REJECT THE DOCTRINES OF MEN:',
    ]);
    expect(secs[0]!.body).toContain('holy sacrament of the altar');
    expect(secs[6]!.body).toContain('The challenge of death');
  });

  it('CONTROL — the editor INTRODUCTION between an identical part-title pair is excluded', () => {
    // The part-title and translation heading are the same line; a naive
    // first-match split would take the part-title and swallow the INTRODUCTION.
    const secs = buildSections(VOL2, profile!);
    const all = secs.map((s) => `${s.heading}\n${s.body}`).join('\n');
    expect(all).not.toContain('The editor writes at length');
    expect(all).not.toContain('The editor introduces');
    expect(all).not.toContain('The editor recounts');
    expect(all).not.toContain('The editor explains the occasion');
    expect(all).not.toContain('The editor weighs');
    expect(all).not.toContain('The editor describes the Kurze Form');
    expect(all).not.toContain('the editor narrates');
    expect(all).not.toContain('The editor traces');
  });

  it('CONTROL — the indented CONTENTS lines never pre-match', () => {
    const secs = buildSections(VOL2, profile!);
    expect(secs).toHaveLength(8);
  });

  it('CONTROL — back matter at INDEX never rides in', () => {
    const secs = buildSections(VOL2, profile!);
    const all = secs.map((s) => `${s.heading}\n${s.body}`).join('\n');
    expect(all).not.toContain('in vain do they worship me, an index entry');
  });

  it('FAIL CLOSED — losing the second of an identical pair aborts as structure drift', () => {
    // Keep the part-title, drop the translation heading: the marker still
    // matches, the section must not.
    const drifted = VOL2.replace(
      'A TREATISE CONCERNING THE BAN\n\n1520\n\nDear friend,',
      'Dear friend,',
    );
    expect(() => scopedSections(drifted, profile!.sections!)).toThrow(/structure drift/);
  });

  it('FAIL CLOSED — a text without the volume title line is refused at the scope start', () => {
    expect(() => scopedSections('A TREATISE CONCERNING THE BAN\n\nSome body text.', profile!.sections!)).toThrow(/scope start/);
  });
});
