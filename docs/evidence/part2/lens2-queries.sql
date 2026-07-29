-- LENS 2 evidence (read-only, DEV Neon branch ep-tiny-hat), 2026-07-19.
-- Every query below is a check that CAN fail; the observed result is recorded inline.

-- [G2] status census: which works are staged/quarantined and therefore must not reach a new surface.
-- OBSERVED: commentary 2 pub / 1 quar / 3 staged; father 3 pub / 1 staged; historian 3 staged;
--           lexicon 5 staged; hymn 5 pub; poetry 10 pub / 2 quar; sermon 7 pub; theology 3 pub; confession 1 pub.
select source_type, status, count(*) from sources group by 1,2 order by 1,2;

-- [G5] chrysostom remediation, independently verified.
-- OBSERVED: total 8846, min unit_ordinal 17, rows with unit<=16 = 0.
select count(*) total,
       min(split_part(split_part(source_id,':',3),'.',1)::int) min_unit,
       count(*) filter (where split_part(split_part(source_id,':',3),'.',1)::int <= 16) le16
from embeddings where metadata->>'work'='chrysostom-homilies';

-- OBSERVED: sections 8846 (ordinal 96..8941, contiguous); section_embeddings 8846; status published.
select count(*) secs, min(ordinal) mn, max(ordinal) mx from sections sec
  join sources s on s.id=sec.source_id where s.slug='chrysostom-homilies';
select count(*) from section_embeddings se join sections sec on sec.id=se.section_id
  join sources s on s.id=sec.source_id where s.slug='chrysostom-homilies';

-- OBSERVED: first section = ordinal 96, unit 17, heading 'Homily 1'.
select ordinal, unit_ordinal, heading from sections sec join sources s on s.id=sec.source_id
  where s.slug='chrysostom-homilies' order by ordinal limit 1;

-- OBSERVED: 2 rows still mention Philip Schaff — both NPNF *series title pages* (ord 2259, 4487),
--           editorial front matter at interior volume boundaries, NOT Schaff-authored prose.
select sec.ordinal, sec.heading from sections sec join sources s on s.id=sec.source_id
  where s.slug='chrysostom-homilies' and sec.body ilike '%Philip Schaff%';

-- [G5-NEW] THIRD-INSTANCE HUNT: publisher advertisements / price lists inside PUBLISHED works.
-- OBSERVED: spurgeon-talks-to-farmers ord 298..300 of 300; tennyson-in-memoriam ord 1..5 of 153;
--           traherne-poems ord 417 of 417.  tennyson + traherne are in SERVED_SONG_VERSE_WORKS.
select s.slug, s.source_type, count(*) c, min(sec.ordinal) mn, max(sec.ordinal) mx
from sections sec join sources s on s.id=sec.source_id
where s.status='published'
  and (sec.body ~ '_s\._ _d\._'
       or sec.body ~* 'Cloth, crown 8vo|Cloth extra, [0-9]+s\. net|Price, \$|sent free by mail'
       or sec.heading ~* 'WORKS PREPARING FOR PUBLICATION|CHEAP EDITIONS|^POETRY\.$|^MISCELLANEOUS\.$')
group by 1,2,s.id order by 1;

-- [G5-NEW] CCEL editorial word-index apparatus stamped with the author's name, in the served pool.
-- OBSERVED: schaff-creeds 585, hodge-systematic 283, owen-works 41, watson-works 17,
--           maclaren-expositions 2, edwards-works 1  (= 929 rows).
select s.slug, count(*) c from sections sec join sources s on s.id=sec.source_id
where s.status='published' and sec.heading ~* '(Latin|French|Greek|German|Hebrew) Words and Phrases'
group by 1 order by 2 desc;

-- [G4] HTML-injection surface for the ts_headline snippet (rendered via dangerouslySetInnerHTML).
-- OBSERVED: 2 rows, both maclaren-expositions, residual OSIS <scripRef ...> markup. Inert today.
select s.slug, count(*) from sections sec join sources s on s.id=sec.source_id
where s.status='published' and sec.body ~ '<[a-zA-Z/!][^>]{0,40}>' group by 1;

-- [G1] register vocabulary actually present. OBSERVED: commentary_entries has no 'historian';
--      embeddings uses a DIFFERENT vocabulary ('prose', null, 'poetry', 'hymn').
select register, count(*) from commentary_entries group by 1 order by 2 desc;
select metadata->>'register', count(*) from embeddings where user_id is null group by 1 order by 2 desc;
