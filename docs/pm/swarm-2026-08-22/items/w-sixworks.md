# W-SIXWORKS — enumeration table (ingest HELD-FOR-OWNER)

Built 2026-08-23 per the order §6: no ingest, no embeddings, no DB writes. The 2026-08-15
WORKLOG names six works "never staged"; the manifest mapping does not resolve, and the prior
session's refusal stands (WORKLOG:4728-4735): *"I did not resume the ingestion... inventing
that scope overnight is how slop happens."* This table exists so the owner can resolve the
scope in one sitting instead of an agent inventing it.

Manifest measured at 917 entries (`ingest/sources.config.json`).

| WORKLOG name | candidates | most likely intended | evidence / note |
|---|---|---|---|
| `luther-church` | **0 exact; 15 `luther-*`** | **UNRESOLVED — name matches nothing** | No manifest slug contains "church" for Luther. The name may abbreviate a set ("Luther church-reformer works") or a work never manifested. 15 luther-* slugs exist (bondage, galatians, good-works, first-prin, prefacetoromans, largecatechism, sermons, smallcat, christianliberty, smalcald, +5). No candidate is dominant; choosing one would be invention |
| `brooks` | 1 | `jowett-brooks` — *Brooks by the Traveller's Way*, **Jowett** | Sole match, but the author is J.H. Jowett, not Thomas Brooks the Puritan. If the intent was Thomas Brooks, the manifest has NO entry — the sole candidate may be a false friend. Flagged rather than recommended |
| `manton` | 9 | ALL 9 (`manton-manton01..08`, `manton-manton20`) | One author, one series — "manton" plausibly means the whole set. Volumes I–VIII + XX |
| `bunyan` | 5 | ALL 5 (`bunyan-grace`, `-holy-war`, `-pilgrim`, `-badman`, `-miscellaneous`) | One author; no basis to pick a subset |
| `pascal` | 3 | ALL 3 (`pascal-memorial`, `-pensees`, `-provincial`) | One author; small set |
| `ignatius` | 2 | ALL 2 (`ignatius-exercises`, `-autobiography`) | Ignatius of LOYOLA (16th c.), not Ignatius of Antioch — worth the owner confirming that is the Ignatius intended before ingest |

**Quota estimate:** unavailable without staging (embedding cost scales with section count,
which only exists post-adapter). Historical anchor: 21,930 sections ≈ $0.19 (WORKLOG:5459).
Manton's 9 volumes of collected works is the only entry likely to be large.

**Recommended minimal interpretation:** ingest bunyan (5) + pascal (3) + ignatius (2) as
unambiguous; hold `manton` for a size check; hold `brooks` and `luther-church` as UNRESOLVED —
one is a probable false friend, the other matches nothing.

**Status: HELD-FOR-OWNER.** The ingest decision is A6 in the owner packet.
