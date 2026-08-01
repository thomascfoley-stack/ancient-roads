# Survey: A8 register inventory: sources.config.json register works vs serving lanes, catalogs, and flip-gate licence/provenance rules

All paths relative to /private/tmp/claude-501/-Users-foley/d263722b-8756-4488-ab13-850a9f6fa409/scratchpad/ar (branch fix/post-a1-corrections-2026-08-01).

## Gate rules (what A8 must clear)
- Allowed licences: `['Public Domain', 'CC BY', 'CC BY-SA']`, fail-closed on null/unknown - src/ingest/allowed-licenses.mjs:20-25. publish-flip.mjs enforces it against `sources.license` for published rows (scripts/publish-flip.mjs:204-206, 240).
- Forbidden provenance domains: `biblehub.com, studylight.org, historicalchristian.faith` incl. subdomains - src/ingest/forbidden-provenance.mjs:23, 35-43; checked on both source provenance URL and section source_url (scripts/publish-flip.mjs:215, 229, 241-242).

## Register inventory (34 entries, ingest/sources.config.json)
Every register entry declares `"license": "Public Domain"`. No register declares anything outside the allowed set (the only non-PD licence in the file is bdb-lexicon "CC BY" :353, a lexicon, not a register). No register entry has a `backfill.forbidden_provenance` field - those exist only on commentary entries (:1357, :1385, :1413, :1440, :1469, :1518). Provenance domains used by registers: ccel.org (18), gutenberg.org (14), archive.org (1), crosswire.org (1) - none forbidden.

**sermon (8)**: spurgeon-sermons :368-389 (ccel.org :380); maclaren-expositions :414-450 (ccel.org :426); watson-works :557-578 (ccel.org :569); flavel-works :580-601 (ccel.org :592); edwards-works :603-624 (ccel.org :615, "NOT the copyrighted Yale WJE" :616); wesley-sermons :626-649 (ccel.org :638, "NOT Abingdon critical ed." :639); whitefield-works :1310-1332 (gutenberg.org #68976 :1322, `serve:false` :1330, QUARANTINE :1331 "PG 68976 is only Vol 1 of 6... no clean sermon-boundary markers"); spurgeon-talks-to-farmers :1546-1567 (gutenberg.org #42518 :1557, no serve flag, no quarantine).

**theology (3)**: owen-works :534-555 (ccel.org :546); hodge-systematic :697-722 (ccel.org :709); calvin-institutes :724-747 (ccel.org :736, Beveridge trans., "NOT Battles/McNeill" :737).

**confession (1)**: schaff-creeds :749-774 (ccel.org :761).

**historian (4)**: josephus-works :776-802 (ccel.org :790, `serve:false` :787, note :788 "STAGED not served - no history read-path yet"); edersheim-lifetimes :804-830 (ccel.org :818, `serve:false` :815, same note :816); schaff-history :832-856 (ccel.org :846, `serve:false` :843, note :844); josephus-whiston :1523-1544 (crosswire.org SWORD module :1534, licence_ref ".conf DistributionLicense=Public Domain, verified 2026-07-16" :1537, NO serve flag, no quarantine).

**hymn (6)**: olney-hymns :858-883 (ccel.org :872, note :870 "requires additive migration adding 'hymn' to source_type CHECK"); scottish-psalter-1650 :885-911 (ccel.org :899, note :897 "tag as paraphrase-voice, never Scripture text"); neale-eastern-hymns :913-938 (ccel.org :927); bramley-carols :940-966 (ccel.org :953, `serve:false` :964, QUARANTINE :965 "no clean-text source... 27-31% OCR-garbage"); watts-hymns :1021-1043 (gutenberg.org #13341 :1035); watts-psalms :1045-1067 (gutenberg.org #13166 :1059, note :1057 paraphrase-voice).

**poetry (12)**: herbert-temple :968-991 (archive.org temple00herb_0 :982, `serve:true` :990); montgomery-sacred-poems :993-1019 (ccel.org :1006, `serve:true` :1018); keble-christian-year :1069-1091 (gutenberg #4272 :1083); donne-divine-poems :1093-1117 (gutenberg #48688 :1107, `serve:false` :1115, QUARANTINE :1116 "served the WHOLE secular volume... under the sacred title"); herrick-noble-numbers :1119-1143 (gutenberg #22421 :1133, `serve:false` :1141, QUARANTINE :1142 same wording); traherne-poems :1145-1166 (gutenberg #61586 :1158); milton-poetical-works :1168-1190 (gutenberg #1745 :1182); rossetti-verses :1192-1214 (gutenberg #77809 :1205, `serve:true` :1213); hopkins-poems :1216-1238 (gutenberg #22403 :1230, note :1228 "ONLY the 1918 first ed... is PD"); tennyson-in-memoriam :1240-1261 (gutenberg #70950 :1253); dante-divine-comedy :1263-1285 (gutenberg #1004 :1277, note :1275 "NEVER Binyon"); wheatley-poems :1287-1308 (gutenberg #409 :1300).

## Serving-side cross-check (web/src/lib/teacher/routing.ts)
- SERVED_SERMON_WORKS :69-72 = spurgeon-sermons, maclaren-expositions, watson-works, flavel-works, edwards-works, wesley-sermons (6 of 8 sermons).
- SERVED_THEOLOGY_WORKS :75-77 = owen-works, hodge-systematic, calvin-institutes, schaff-creeds (all theology + the confession).
- SERVED_LANE_WORKS :101 = union of the two above (10 works); walled out of the exegetical pool/FTS via EXEGETICAL_FTS_EXCLUSION :112.
- SERVED_SONG_VERSE_WORKS :84-91 = all 6 hymn + poetry works EXCEPT the four quarantined ones - matches quarantine flags exactly (comments :78-83).
- Historians: in NO served list; :48-49 comment excludes "the three historians (no read path)". josephus-whiston is a FOURTH historian the comment does not mention - equally unserved, but its status (staged vs merely omitted) is NOT ESTABLISHED.
- spurgeon-talks-to-farmers: clean config entry but absent from SERVED_SERMON_WORKS. Reason NOT ESTABLISHED - flag for owner before A8, since routing membership "IS the publish switch" (:39-41) and catalogs shelve by type, so publishing its `sources` row would shelve it in the Sermons catalog while the sermon lane never retrieves it.

## Catalogs (web/src/lib/catalog-defs.ts)
- sermons: types ['sermon'] :42; hymns-poetry: ['hymn','poetry'] with sub-filters :43-48; historians: ['historian'] :54 (added 2026-08-01, owner decision).
- theology and confession are shelved NOWHERE, deliberately (:15-17, :53) - so owen/hodge/calvin-institutes/schaff-creeds get retrieval lanes but no Library catalog. Catalog queries are published-only (`status='published'` load-bearing, :26-27).

## A8 STOP candidates
- Licence-gate STOPs: NONE - all 34 registers declare Public Domain, inside the allowed set.
- Forbidden-domain STOPs: NONE - no register provenance touches biblehub/studylight/historicalchristian.faith (the sole biblehub entry is commentary barnes-notes :14, :19, already quarantined).
- Must-NOT-publish (quarantined, serve:false): whitefield-works :1331, bramley-carols :965, donne-divine-poems :1116, herrick-noble-numbers :1142. Any A8 flip list containing these slugs breaches the config's own quarantine.
- Staged-not-served: josephus-works, edersheim-lifetimes, schaff-history (serve:false, no read path) - publishable to the Historians catalog only if the owner intends shelf-without-retrieval; retrieval readiness NOT ESTABLISHED.
- Ambiguous, owner ruling needed: spurgeon-talks-to-farmers and josephus-whiston (clean entries, no quarantine, absent from every served list; whether omission is deliberate is NOT ESTABLISHED).
- Note: whether dev rows for these works exist/match this config was not verifiable (no database access this session - config-and-code evidence only).
