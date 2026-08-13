# Corpus-backlog close-out — the owner-terminal runbook (2026-08-13)

Everything below is staged and verified on dev; production already has migrations
108/112/113/114 applied and ledgered. What remains is exactly the two TTY-gated tool runs —
the gates exist to be answered by a person (`ownerGate`: "a piped answer is not consent").
Run from the worktree: `/Users/foley/Projects/ancient-roads-corpus`, branch `feat/corpus-backlog`.

## Step 1 — corpus-copy the 8 works dev→prod (lands them STAGED, publishes nothing)

```bash
cd /Users/foley/Projects/ancient-roads-corpus
COPY_ALLOW=1 COPY_EXPECT_HOST=ep-odd-fog-atnykudm \
CORPUS_COPY_SOURCE_URL="$(node -e 'const fs=require("fs");const r=fs.readFileSync(".env.local","utf8");const m=r.match(/^DATABASE_URL_UNPOOLED=(.+)$/m)||r.match(/^DATABASE_URL=(.+)$/m);process.stdout.write(m[1].trim())')" \
CORPUS_COPY_DEST_URL="$(cat ~/.neon_prod_url)" \
  node scripts/corpus-copy.mjs --slugs=docs/evidence/corpus-backlog/copy-slugs-2026-08-13.json \
    --evidence=docs/evidence/corpus-backlog
```

The gate prints the work list and asks you to type `copy`. Dry-run census (2026-08-13, dev):
barnes-crosswire-nt 7,431 § · scofield 3,207 · pnt 6,067 · poole-tcp 24,104 · whitefield 59 ·
donne 41 · herrick 270 · josephus-whiston 4,112 § + 6,492 flat — all with full
section_embeddings and clean, license-verified provenance. They land `staged`, served=false.

NOTE: josephus-whiston already exists on prod (published, 4,112 sections, 0 flat rows). The
copy tops up its missing flat embeddings — if the tool refuses an existing slug, run the copy
for the other seven and ask for the one-off josephus flat-row copy instead (it is a simple
`served=false` row copy; the session that built it can produce it).

thayers-lexicon is deliberately NOT in the file: `serve:false` (the corpus-copy tool refuses
serve:false slugs — quarantine is law) and lexicons are served-by-nothing pending the D4/A8
owner call.

## Step 2 — publish + serve flips (7 works + josephus serve)

```bash
node scripts/publish-flip.mjs --slugs=docs/evidence/corpus-backlog/flip-slugs-2026-08-13.json
node scripts/publish-flip.mjs --slugs=docs/evidence/corpus-backlog/flip-slugs-2026-08-13.json --serve-published
```

(flip-slugs JSON lists exactly: barnes-crosswire-nt, scofield-crosswire, pnt-crosswire,
poole-tcp, whitefield-works, donne-divine-poems, herrick-noble-numbers. josephus-whiston is
already published — only its rows need the serve flip; if publish-flip's flow doesn't cover
that case, the serve flip for `josephus-whiston` alone is the same tool's serve step.)

The flip tool runs its own census/adjudication gates (A3 rule: published-but-not-admitted is a
STOP). All seven are admitted via the SERVED_*_WORKS additions in this branch — the routing
code must be DEPLOYED for the lanes to answer, but the flips are DB-state and safe to run
first (worst case the works are published-and-served while the pre-lane binary still runs —
the /ask payload simply won't surface historians until the deploy).

## Step 3 — deploy

`./deploy.sh` from a clean tree after this branch merges. The historian /ask toggle UI
("History (coming soon)") is flip-time product work — the lane answers via the API flag
`historians:true` as soon as the code deploys; enabling the checkbox is a one-line UI change.

## If anything refuses

Every gate refusal is information — paste it back. The pre-stated expectations: corpus-copy
`mismatch: 0` per work; the flip's §4 diff should touch exactly the seven slug lines plus
register/totals lines.
