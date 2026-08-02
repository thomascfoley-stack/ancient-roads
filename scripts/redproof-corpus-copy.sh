#!/bin/bash
# RED-PROOF FOR corpus-copy.mjs — a throwaway Postgres cluster, two databases, real pgvector.
#
# The tool writes to production. Every guard in it therefore has to be WATCHED REFUSING, not
# read and believed (docs/THE_LOOP.md rule 4). This stands up a disposable cluster on a spare
# port with `vector` installed, so the destination's columns are the real `vector(1024)` type
# rather than a stand-in that would let a format bug through.
#
#   bash scripts/redproof-corpus-copy.sh
#
# Everything lives under a temp dir and is destroyed on exit, including on failure. It never
# reads a real credential and never contacts a real endpoint.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

PGBIN=/opt/homebrew/opt/postgresql@17/bin
PORT=54329
# macOS + PG17: without a valid locale the postmaster aborts with "became multithreaded during
# startup". Homebrew's own caveat says to set this; it is not optional here.
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
TMP="$(mktemp -d /tmp/corpus-copy-redproof.XXXXXX)"
PASS=0
FAIL=0

cleanup() {
  "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1
  rm -rf "$TMP"
}
trap cleanup EXIT

say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
# A guard test PASSES when the tool REFUSES. Asserting the exit code alone would accept a crash
# as a refusal, so the expected reason must appear in the output too.
expect_refusal() {
  local label="$1" pattern="$2"; shift 2
  local out; out="$("$@" 2>&1)"; local code=$?
  if [ $code -eq 0 ]; then
    printf '  \033[31m✗ %s — EXITED 0; the guard did not fire\033[0m\n' "$label"; FAIL=$((FAIL+1)); return
  fi
  if ! grep -qE "$pattern" <<<"$out"; then
    printf '  \033[31m✗ %s — refused, but not for the expected reason\033[0m\n' "$label"
    printf '      wanted /%s/, got: %s\n' "$pattern" "$(head -3 <<<"$out" | tr '\n' ' ')"
    FAIL=$((FAIL+1)); return
  fi
  printf '  \033[32m✓ %s\033[0m\n' "$label"; PASS=$((PASS+1))
}
expect_ok() {
  local label="$1"; shift
  local out; out="$("$@" 2>&1)"; local code=$?
  if [ $code -ne 0 ]; then
    printf '  \033[31m✗ %s — exited %d\033[0m\n%s\n' "$label" $code "$(tail -5 <<<"$out")"; FAIL=$((FAIL+1)); return
  fi
  printf '  \033[32m✓ %s\033[0m\n' "$label"; PASS=$((PASS+1))
}

say "Standing up a throwaway cluster on port $PORT"
"$PGBIN/initdb" -D "$TMP/data" -U postgres --auth=trust >/dev/null 2>&1 || { echo "initdb failed"; exit 1; }
"$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=localhost" -l "$TMP/pg.log" start >/dev/null 2>&1 \
  || { echo "pg_ctl start failed"; tail -20 "$TMP/pg.log"; exit 1; }

PSQL="$PGBIN/psql -h localhost -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "CREATE DATABASE devsrc;"  >/dev/null
$PSQL -c "CREATE DATABASE prodest;" >/dev/null

SCHEMA="
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE sources (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  author TEXT NOT NULL, author_died SMALLINT, year_written SMALLINT,
  source_type TEXT NOT NULL CHECK (source_type IN ('commentary','sermon','historian','theology','father','confession','lexicon')),
  tradition TEXT NOT NULL, era TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'en', license TEXT NOT NULL,
  provenance JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','published','quarantined')));
CREATE TABLE sections (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, source_id BIGINT NOT NULL REFERENCES sources(id),
  ordinal INT NOT NULL, heading TEXT, body TEXT NOT NULL,
  tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading,'') || ' ' || body)) STORED,
  UNIQUE (source_id, ordinal));
CREATE TABLE section_anchors (section_id BIGINT NOT NULL REFERENCES sections(id), verse_id_start INT NOT NULL,
  verse_id_end INT NOT NULL, PRIMARY KEY (section_id, verse_id_start));
CREATE TABLE section_embeddings (section_id BIGINT NOT NULL REFERENCES sections(id), model_slug TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL, PRIMARY KEY (section_id, model_slug));
CREATE TABLE section_history_anchors (section_id BIGINT NOT NULL REFERENCES sections(id), kind TEXT NOT NULL
  CHECK (kind IN ('person','place','event','institution')), entity_slug TEXT NOT NULL, entity_label TEXT NOT NULL,
  PRIMARY KEY (section_id, kind, entity_slug));
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('bible_verse','commentary','user_upload','sermon_transcript','study_note','book_chapter')),
  source_id TEXT NOT NULL, chunk_index INT DEFAULT 0, content TEXT NOT NULL, embedding VECTOR(1024),
  metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT now());
CREATE UNIQUE INDEX idx_embeddings_source ON embeddings(source_type, source_id, chunk_index);
"
$PSQL -d devsrc  -c "$SCHEMA" >/dev/null
$PSQL -d prodest -c "$SCHEMA" >/dev/null

# Seed the SOURCE with a real, unquarantined work from the manifest, plus a USER row in the flat
# store that must never move, plus a work that is NOT in the slug list and must not be touched.
VEC="$(node -e "console.log('['+Array.from({length:1024},(_,i)=>(i%97)/97).join(',')+']')")"
$PSQL -d devsrc -c "
INSERT INTO sources (slug,title,author,source_type,tradition,era,license,provenance,status) VALUES
 ('olney-hymns','Olney Hymns','Newton','sermon','anglican','modern','Public Domain','{\"url\":\"https://www.ccel.org/ccel/newton/olneyhymns\"}','staged'),
 ('watts-hymns','Watts Hymns','Watts','sermon','nonconformist','modern','Public Domain','{\"url\":\"https://www.ccel.org/x\"}','staged');
INSERT INTO sections (source_id,ordinal,heading,body)
 SELECT id, g, 'Hymn '||g, 'Amazing grace, verse '||g FROM sources, generate_series(1,5) g WHERE slug='olney-hymns';
INSERT INTO sections (source_id,ordinal,heading,body)
 SELECT id, g, 'Other '||g, 'Untouched body '||g FROM sources, generate_series(1,3) g WHERE slug='watts-hymns';
INSERT INTO section_anchors (section_id,verse_id_start,verse_id_end)
 SELECT s.id, 43003016, 43003016 FROM sections s JOIN sources src ON src.id=s.source_id WHERE src.slug='olney-hymns';
INSERT INTO section_embeddings (section_id,model_slug,embedding)
 SELECT s.id,'bge-large-en-v1.5','$VEC'::vector FROM sections s JOIN sources src ON src.id=s.source_id WHERE src.slug='olney-hymns';
INSERT INTO section_history_anchors (section_id,kind,entity_slug,entity_label)
 SELECT s.id,'person','newton','John Newton' FROM sections s JOIN sources src ON src.id=s.source_id WHERE src.slug='olney-hymns' AND s.ordinal=1;
INSERT INTO embeddings (user_id,source_type,source_id,chunk_index,content,embedding,metadata) VALUES
 (NULL,'commentary','olney:1',0,'corpus row','$VEC'::vector,'{\"work\":\"olney-hymns\"}'),
 (NULL,'commentary','olney:2',1,'corpus row 2','$VEC'::vector,'{\"work\":\"olney-hymns\"}'),
 ('user-42','study_note','note:1',0,'MY PRIVATE NOTE','$VEC'::vector,'{\"work\":\"olney-hymns\"}');
" >/dev/null

SRC="postgresql://postgres@localhost:$PORT/devsrc"
DEST="postgresql://postgres@localhost:$PORT/prodest"
SLUGS="$TMP/slugs.json";      echo '{"slugs":["olney-hymns"]}'              > "$SLUGS"
BADSLUG="$TMP/bad.json";      echo '{"slugs":["not-in-the-manifest"]}'      > "$BADSLUG"
QUARANTINED="$TMP/q.json";    echo '{"slugs":["whitefield-works"]}'         > "$QUARANTINED"
FORBIDDEN="$TMP/f.json";      echo '{"slugs":["barnes-notes"]}'             > "$FORBIDDEN"
DUPES="$TMP/d.json";          echo '{"slugs":["olney-hymns","olney-hymns"]}'> "$DUPES"
RUN=(node scripts/corpus-copy.mjs --local-redproof --redproof-skip-gate --evidence="$TMP/ev")
# Same local relaxation, but the human gate LEFT ON — this is how the TTY refusal gets driven.
GATED=(node scripts/corpus-copy.mjs --local-redproof --evidence="$TMP/ev")

say "GUARDS — each must REFUSE, and for the stated reason"
expect_refusal "slug not in the manifest"          "not in ingest/sources.config.json" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$DEST" COPY_ALLOW=1 COPY_EXPECT_HOST=localhost "${RUN[@]}" --slugs="$BADSLUG"
expect_refusal "quarantined slug (serve:false)"    "quarantine is law" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$DEST" COPY_ALLOW=1 COPY_EXPECT_HOST=localhost "${RUN[@]}" --slugs="$QUARANTINED"
expect_refusal "forbidden-aggregator provenance"   "ADR-008" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$DEST" COPY_ALLOW=1 COPY_EXPECT_HOST=localhost "${RUN[@]}" --slugs="$FORBIDDEN"
expect_refusal "duplicate slug in the list"        "same slug twice" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$DEST" COPY_ALLOW=1 COPY_EXPECT_HOST=localhost "${RUN[@]}" --slugs="$DUPES"
# --local-redproof relaxes ONLY the destination declaration, so the destination-gate cases below
# are run WITHOUT it, against a prod-shaped URL. Those are the gates that matter in anger, and a
# red-proof that exercised them only in local mode would be proving nothing.
FAKEPROD="postgresql://u@ep-odd-fog-atnykudm.eu-central-1.aws.neon.tech/db"
BARE=(node scripts/corpus-copy.mjs --evidence="$TMP/ev")

expect_refusal "source is PRODUCTION"              "which is production" \
  env CORPUS_COPY_SOURCE_URL="$FAKEPROD" CORPUS_COPY_DEST_URL="$DEST" COPY_ALLOW=1 COPY_EXPECT_HOST=localhost "${RUN[@]}" --slugs="$SLUGS"
expect_refusal "source is PRODUCTION even with --local-redproof (no skeleton key)" "which is production" \
  env CORPUS_COPY_SOURCE_URL="$FAKEPROD" CORPUS_COPY_DEST_URL="$DEST" "${RUN[@]}" --slugs="$SLUGS"
expect_refusal "--local-redproof pointed at a REAL endpoint" "not local" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$FAKEPROD" "${RUN[@]}" --slugs="$SLUGS"
expect_refusal "no COPY_ALLOW flag"                "no cutover override" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$FAKEPROD" COPY_EXPECT_HOST=ep-odd-fog-atnykudm "${BARE[@]}" --slugs="$SLUGS"
expect_refusal "no COPY_EXPECT_HOST declaration"   "declared endpoint" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$FAKEPROD" COPY_ALLOW=1 "${BARE[@]}" --slugs="$SLUGS"
expect_refusal "declaration names the WRONG endpoint" "declared endpoint" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$FAKEPROD" COPY_ALLOW=1 COPY_EXPECT_HOST=ep-some-other-thing "${BARE[@]}" --slugs="$SLUGS"
expect_refusal "source and destination identical"  "same database" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$SRC" COPY_ALLOW=1 COPY_EXPECT_HOST=localhost "${RUN[@]}" --slugs="$SLUGS"
expect_refusal "no source credential in the env"   "CORPUS_COPY_SOURCE_URL is unset" \
  env COPY_ALLOW=1 COPY_EXPECT_HOST=localhost "${RUN[@]}" --slugs="$SLUGS"
expect_refusal "piped stdin is not consent"        "not a TTY" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$DEST" COPY_ALLOW=1 COPY_EXPECT_HOST=localhost "${GATED[@]}" --slugs="$SLUGS"
expect_refusal "--redproof-skip-gate is inert without --local-redproof" "not a TTY|not local|declared endpoint" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$DEST" COPY_ALLOW=1 COPY_EXPECT_HOST=localhost \
      node scripts/corpus-copy.mjs --redproof-skip-gate --evidence="$TMP/ev" --slugs="$SLUGS"

say "THE COPY ITSELF"
expect_ok "copies olney-hymns" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$DEST" COPY_ALLOW=1 COPY_EXPECT_HOST=localhost "${RUN[@]}" --slugs="$SLUGS"

check() { # label, sql, expected
  local got; got="$($PSQL -d prodest -t -A -c "$2")"
  if [ "$got" = "$3" ]; then printf '  \033[32m✓ %s (%s)\033[0m\n' "$1" "$got"; PASS=$((PASS+1));
  else printf '  \033[31m✗ %s — expected %s, got %s\033[0m\n' "$1" "$3" "$got"; FAIL=$((FAIL+1)); fi
}
check "5 sections landed"        "SELECT count(*) FROM sections s JOIN sources src ON src.id=s.source_id WHERE src.slug='olney-hymns'" 5
check "5 anchors landed"         "SELECT count(*) FROM section_anchors" 5
check "5 vectors landed"         "SELECT count(*) FROM section_embeddings" 5
check "1 history anchor landed"  "SELECT count(*) FROM section_history_anchors" 1
check "2 flat corpus rows landed" "SELECT count(*) FROM embeddings" 2
check "status is STAGED, never published" "SELECT status FROM sources WHERE slug='olney-hymns'" staged
check "the USER row did NOT move" "SELECT count(*) FROM embeddings WHERE user_id IS NOT NULL" 0
check "the unlisted work did NOT move" "SELECT count(*) FROM sources WHERE slug='watts-hymns'" 0
SRCVEC="$($PSQL -d devsrc -t -A -c "SELECT embedding::text FROM section_embeddings LIMIT 1")"
check "vectors are byte-identical to what the SOURCE stores" \
  "SELECT count(*) FROM section_embeddings WHERE embedding::text <> '$SRCVEC'" 0
check "and that vector is real, not empty" \
  "SELECT CASE WHEN length('$SRCVEC') > 1000 THEN 'yes' ELSE 'no' END" yes
check "anchors point at the DESTINATION's own section ids" \
  "SELECT count(*) FROM section_anchors a WHERE NOT EXISTS (SELECT 1 FROM sections s WHERE s.id=a.section_id)" 0
check "heading/body survived the hop" \
  "SELECT body FROM sections s JOIN sources src ON src.id=s.source_id WHERE src.slug='olney-hymns' AND s.ordinal=3" "Amazing grace, verse 3"

say "IDEMPOTENCY — a second run must add nothing"
expect_ok "second run succeeds" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$DEST" COPY_ALLOW=1 COPY_EXPECT_HOST=localhost "${RUN[@]}" --slugs="$SLUGS"
check "still 5 sections after re-run" "SELECT count(*) FROM sections" 5
check "still 2 flat rows after re-run" "SELECT count(*) FROM embeddings" 2

say "PUBLISHED IS UNREACHABLE — a destination row already published is not disturbed"
$PSQL -d prodest -c "UPDATE sources SET status='published' WHERE slug='olney-hymns';" >/dev/null
expect_ok "re-run over a published row" \
  env CORPUS_COPY_SOURCE_URL="$SRC" CORPUS_COPY_DEST_URL="$DEST" COPY_ALLOW=1 COPY_EXPECT_HOST=localhost "${RUN[@]}" --slugs="$SLUGS"
check "the copier did not un-publish it" "SELECT status FROM sources WHERE slug='olney-hymns'" published
# And the converse: nothing in the tool can CREATE a published row. Comment lines are stripped
# first — the header legitimately discusses 'published' while explaining that it is unreachable,
# and a check that could not tell prose from code would fail on its own documentation.
CODE="$(grep -vE '^\s*(\*|//|/\*)' scripts/corpus-copy.mjs)"
if grep -qE "'published'|status\s*=\s*.published|SET status" <<<"$CODE"; then
  printf '  \033[31m✗ the copier CODE can reach status published\033[0m\n'
  grep -nE "'published'|status\s*=\s*.published|SET status" <<<"$CODE" | head -3
  FAIL=$((FAIL+1))
else
  printf '  \033[32m✓ no code path in the copier reaches published\033[0m\n'; PASS=$((PASS+1))
fi
# Anti-vacuity: the check above is only meaningful if it CAN see the literal that is there.
if grep -qE "'staged'" <<<"$CODE"; then
  printf '  \033[32m✓ (and it does see the literal staged, so the grep is not blind)\033[0m\n'; PASS=$((PASS+1))
else
  printf '  \033[31m✗ the comment-stripped code has no staged literal — the grep is blind\033[0m\n'; FAIL=$((FAIL+1))
fi

say "RESULT"
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
