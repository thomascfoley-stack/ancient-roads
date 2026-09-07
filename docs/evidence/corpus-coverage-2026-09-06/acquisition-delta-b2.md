# Track B2 — ACQUISITION_MANIFEST §4/§5 delta vs ingest/sources.config.json

Date: 2026-09-07. Method: every figure/work named in `docs/ACQUISITION_MANIFEST.md` §4 (4a–4d)
and §5 (tiers 1–3) re-checked against the manifest by slug/title/author probe
(`node -e` substring probe over 917 entries, plus title/provenance read of borderline slugs).

## Verified already declared — NOT gaps

| § ref | Figure/work | Manifest evidence |
|---|---|---|
| §4a | Aquinas, *Catena Aurea* | `catena-aurea` (Newman 1841–45, CrossWire) — known trap, confirmed |
| §4a | Bernard, Sermons on Song of Songs | `bernard-song-sermons` (Eales, archive `LifeAndWorksOfSaintBernardV4`) — the USE edition |
| §4a | Thomas à Kempis | `kempis-imitation`, `kempis-imitation-benham` (Benham 1874, Gutenberg #1653 — the USE edition) |
| §4a | Julian of Norwich | `julian-revelations` (Warrack 1901, Gutenberg #52958 — the USE edition) |
| §4a | Teresa / John of the Cross / de Sales / Ignatius / Pascal / Catherine of Siena / Anselm | `teresa-castle2`, `teresa-life`, `john-cross-*` (3), `desales-*` (2), `ignatius-*` (2), `pascal-*` (3), `catherine-dialog`, `anselm-*` (3) |
| §4b | John of Damascus | `schaff-npnf209` (NPNF2-09) — order's known trap, confirmed |
| §4c | Matthew Poole | `poole-tcp` (*Annotations upon the Holy Bible*, 1685) |
| §4c | Maclaren / Ryle / Moule / Meyer / Murray | `maclaren-expositions` +5, `ryle-expository` +3, `moule-*` 3, `meyer-*` 3, `murray-*` 11 |
| §4c | Knox / Latimer / Cranmer | `knox-*` 3, `latimer-sermons`, `cranmer-doctrine` |
| §4c | Owen / Watson / Baxter / Bunyan / Flavel / Charnock | 34 / 7 / 5 / 5 / 7 / 6 entries respectively |
| §4c | Andrewes / Donne / Jeremy Taylor | `andrewes-devotions1`, `donne-*` 5, `taylor-holy-living`, `taylor-holy-dying` |
| §4c | Finney / Moody | `finney-*` 6, `moody-anecdotes` |
| §5 T1 | Josephus | `josephus-whiston` (Whiston 1737, CrossWire) |
| §5 T1 | Edersheim | `edersheim-lifetimes`, `edersheim-sketches`, `edersheim-temple` |
| §5 T1 | Eusebius | `schaff-npnf201` (McGiffert, NPNF2-01) |
| §5 T1 | Schaff, *History of the Christian Church* | `schaff-hcc1`–`schaff-hcc8` (all 8 vols) |
| §5 T2 | Philo (Yonge) | `philo-works` |
| §5 T2 | Socrates + Sozomen / Theodoret | `schaff-npnf202`, `schaff-npnf203` |
| §5 T2 | Neander | `neander-a-light` (Torrey 1851), `neander-a-life` + 3 expositions — declared, though tagged `theology` not `historian` (minor note, not a gap) |

## HELD, not proposed (owner ruling)

- **Menno Simons** — `simon-works1`/`simon-works2` declared but HELD by ADR-110 FORK C
  (`docs/DECISIONS.md:1644-1648`: non-verse `theology` works have no retrieval path).
  ⚠️ **Edition-trap flag for the owner**: both entries carry `provenance.year: 1983`
  (`licence_basis: rightsDeclared`, CCEL text) against ACQUISITION_MANIFEST §4c's required
  **Funk 1871** edition (⚠️ not Wenger 1956). Open flag; do not ingest.

## Genuine gaps (named in §4/§5, NO manifest entry — each re-checked)

| # | § ref | Figure / work | Required edition (per manifest) |
|---|---|---|---|
| 1 | §4a | **Cornelius a Lapide**, *The Great Commentary* | Mossman 1876–1908, archive.org `greatcommentaryo05lapi` |
| 2 | §4a | **Wycliffe**, Sermons | Arnold 1869 |
| 3 | §4c | **G. Campbell Morgan**, *Analyzed Bible* / *Living Messages* | pre-1930 titles ONLY (§4d) |
| 4 | §4c | **Heinrich Bullinger**, *Decades* | Parker Society (1849–52). NB: `bullinger-apocalypse` in the manifest is **E.W. Bullinger** (1837–1913), a different person |
| 5 | §4c | **Zwingli**, *Latin Works* | 1901–29 translations |
| 6 | §4c | **Tyndale**, Expositions / Works | Parker Society (1848–52) |
| 7 | §4c | **Thomas Brooks** (Puritan) | — NB: `jowett-brooks` is J.H. Jowett's *Brooks by the Traveller's Way* (Phillips Brooks), unrelated |
| 8 | §4c | **William Perkins** | — |
| 9 | §4c | **Jeremiah Burroughs** | — |
| 10 | §4c | **Thomas Goodwin** | — |
| 11 | §4c | **Richard Hooker** | — |
| 12 | §4c | **Octavius Winslow** | — |
| 13 | §4c | **Johann Gerhard**, *Sacred Meditations* | Heisler 1896. NB: `kelly-gerhardtsong` / `hewitt-gerhardt` are **Paul Gerhardt** the hymnwriter — a different person |
| 14 | §5 T1 | **Conybeare & Howson**, *Life and Epistles of St. Paul* | archive.org. NB: `conybeare-lxxgrammar` is a different work |
| 15 | §5 T1 | **George Adam Smith**, *Historical Geography of the Holy Land* | archive.org. NB: `smith-ga-*` are his Isaiah/Jeremiah works |
| 16 | §5 T2 | **Schürer**, *History of the Jewish People in the Time of Jesus Christ* | T&T Clark 1885–91 ONLY (⚠️ avoid Vermes–Millar revision, copyrighted) |
| 17 | §5 T2 | **Rawlinson**, *Seven Great Monarchies* | Gutenberg |
| 18 | §5 T2 | **Mosheim** | archive.org |
| 19 | §5 T3 | **Ramsay** — *St. Paul the Traveller*, *Cities of St. Paul*, *Letters to the Seven Churches* | pre-1929. NB: `ramsay-bethlehem` (*Was Christ Born in Bethlehem?*) IS declared — partial figure coverage |
| 20 | §5 T3 | **Milman**, *Latin Christianity* / *History of the Jews* | — |
| 21 | §5 T3 | **Records of the Past** / **A.H. Sayce** | — (dated ANE; §5 itself marks low value) |
| 22 | §5 T3 | **William Cave** | — |

## Excluded by §4b/§4d — NOT gaps

- Later Orthodox: **Philokalia, Gregory Palamas, Symeon the New Theologian** — no PD English exists
  (§4b). Orthodox coverage = patristic only.
- §4d hard exclusions (Oswald Chambers, Tozer, Larcher Aquinas, post-1930 translations,
  Bramley & Stainer) — checked: none present in the manifest.
