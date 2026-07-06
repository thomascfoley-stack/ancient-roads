# Document 1: Database schema

Target: Postgres 16 on Supabase (auth, RLS, pgvector, storage in one system).
All new infra, no shared accounts with any existing project.

Executable version: [supabase/migrations/0001_init.sql](../supabase/migrations/0001_init.sql)

Three zones with different security postures:

| Zone | Tables | Access |
|---|---|---|
| Corpus | sources, bible texts, sections, embeddings, topics | Public read, service-role write |
| User | profiles, studies, messages, memory, entitlements | RLS: owner only |
| Config | models, teachers, prompts, eval runs | Service-role only, never client-readable |

---

## 1. Verse identity (the foundation, get this right first)

Canonical verse ID is an integer: `book * 1_000_000 + chapter * 1_000 + verse`.
Genesis 1:1 = 1001001. John 3:16 = 43003016. Sortable, rangeable, joinable.

Book numbers: standard Protestant 66 (Gen=1 .. Rev=66). Reserve 67+ for
deuterocanon if ever needed. Canonical versification = English KJV scheme;
other schemes (Hebrew MT, LXX) map onto it.

```sql
create table books (
  book_num      smallint primary key,
  slug          text not null unique,        -- 'gen', 'john'
  name          text not null,
  testament     text not null check (testament in ('OT','NT')),
  chapter_count smallint not null
);

-- Handles Psalm titles, Malachi 3/4, Joel 2/3, etc.
create table versification_map (
  scheme            text not null,           -- 'MT', 'LXX', 'Vulgate'
  scheme_verse_id   int  not null,
  canonical_verse_id int not null,
  primary key (scheme, scheme_verse_id)
);
```

Source the mapping data from STEPBible TVTMS (CC BY). Do not hand-build it.

## 2. Bible texts

```sql
create table translations (
  id            smallint primary key generated always as identity,
  slug          text not null unique,        -- 'web', 'kjv', 'bsb', 'sblgnt', 'wlc'
  name          text not null,
  language      text not null,               -- 'en', 'grc', 'hbo'
  versification text not null default 'KJV',
  license       text not null,               -- 'public_domain', 'cc_by', 'licensed'
  license_terms jsonb,                       -- display limits, royalty terms for licensed
  is_active     boolean not null default true
);

create table verses (
  translation_id smallint not null references translations,
  verse_id       int not null,               -- canonical
  text           text not null,
  tsv            tsvector generated always as (to_tsvector('english', text)) stored,
  primary key (translation_id, verse_id)
);
create index verses_tsv_idx on verses using gin (tsv);
```

## 3. Original language layer (word-level)

One row per word token, aligned to canonical verse IDs. Source: STEPBible
TAGNT/TAHOT (CC BY), MorphGNT, OpenScriptures Hebrew Bible.

```sql
create table original_words (
  id        bigint primary key generated always as identity,
  verse_id  int not null,
  language  text not null check (language in ('grc','hbo','arc')),
  position  smallint not null,               -- word order within verse
  surface   text not null,                   -- inflected form as written
  lemma     text not null,
  strongs   text,                            -- 'G26', 'H2617'
  morph     text,                            -- parsing code
  gloss     text,                            -- short English gloss
  unique (verse_id, language, position)
);
create index ow_lemma_idx on original_words (lemma);
create index ow_strongs_idx on original_words (strongs);

create table lexicon_entries (
  id       bigint primary key generated always as identity,
  source_id bigint not null references sources,  -- Strong's, Thayer, BDB
  strongs  text,
  lemma    text not null,
  language text not null,
  entry    text not null                     -- full definition text
);
create index lex_strongs_idx on lexicon_entries (strongs);
```

## 4. Corpus: sources and sections

Every non-Bible text (commentary, sermon, theology book, church father) is a
`source` split into `sections` (the retrieval unit, roughly 200 to 800 words).

```sql
create table sources (
  id          bigint primary key generated always as identity,
  slug        text not null unique,
  title       text not null,
  author      text not null,
  author_died smallint,                      -- public domain math
  year_written smallint,
  source_type text not null check (source_type in
    ('commentary','sermon','theology','father','confession','lexicon')),
  tradition   text not null,                 -- 'reformed','catholic','orthodox',
                                             -- 'wesleyan','baptist','patristic','lutheran'
  era         text not null,                 -- 'patristic','medieval','reformation',
                                             -- 'puritan','modern'
  language    text not null default 'en',
  license     text not null,
  provenance  jsonb                          -- where ingested from, when, checksum
);

create table sections (
  id         bigint primary key generated always as identity,
  source_id  bigint not null references sources,
  ordinal    int not null,                   -- reading order within source
  heading    text,
  body       text not null,
  tsv        tsvector generated always as (to_tsvector('english', body)) stored,
  unique (source_id, ordinal)
);
create index sections_tsv_idx on sections using gin (tsv);

-- THE join that powers "show me 5 views on this verse"
create table section_anchors (
  section_id     bigint not null references sections,
  verse_id_start int not null,
  verse_id_end   int not null,
  primary key (section_id, verse_id_start)
);
create index anchors_range_idx on section_anchors (verse_id_start, verse_id_end);

-- Embeddings live apart from content: re-embedding is a rebuild, not a migration
create table section_embeddings (
  section_id  bigint not null references sections,
  model_slug  text not null,                 -- 'bge-m3-v1'
  embedding   vector(1024) not null,
  primary key (section_id, model_slug)
);
create index se_hnsw_idx on section_embeddings
  using hnsw (embedding vector_cosine_ops);
```

"5 views across 2+ traditions" =
`select ... from section_anchors join sections join sources where verse range
overlaps target, order by tradition diversity`. Metadata query, no model
involved.

## 5. Topical guides (the precomputed fat head)

Top ~200 struggles/topics get curated, human-reviewed guides served from
cache. This is both unit economics and editorial control.

```sql
create table topics (
  id         bigint primary key generated always as identity,
  slug       text not null unique,           -- 'alcohol', 'anxiety', 'grief'
  title      text not null,
  aliases    text[] not null default '{}',   -- query phrases that map here
  status     text not null default 'draft' check (status in
             ('draft','generated','reviewed','published')),
  body       jsonb,                          -- structured per output contract
  updated_at timestamptz not null default now()
);
```

## 6. User zone (RLS on every table, no exceptions)

```sql
create table profiles (
  user_id     uuid primary key references auth.users on delete cascade,
  display_name text,
  tradition   text,                          -- weights retrieval, never filters
  translation smallint references translations,
  plan        text not null default 'free',
  created_at  timestamptz not null default now()
);

-- A study = a channel. UI object and memory object are the same row.
create table studies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  title       text not null,                 -- 'self-control'
  status      text not null default 'active' check (status in ('active','archived')),
  summary     text,                          -- rolling model-written recap
  include_library boolean not null default true,
  created_at  timestamptz not null default now(),
  last_active timestamptz not null default now()
);
create index studies_user_idx on studies (user_id, last_active desc);

create table messages (
  id         uuid primary key default gen_random_uuid(),
  study_id   uuid not null references studies on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       text not null check (role in ('user','teacher')),
  teacher_slug text,                         -- null for user messages
  content    jsonb not null,                 -- user: {text}; teacher: full output contract
  created_at timestamptz not null default now()
);
create index messages_study_idx on messages (study_id, created_at);
-- At scale: partition by created_at month; do not design for this now.

-- Denormalized from teacher message content for analytics + "my sources"
create table message_citations (
  message_id uuid not null references messages on delete cascade,
  section_id bigint not null references sections,
  primary key (message_id, section_id)
);

create table saved_passages (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  study_id       uuid references studies on delete set null,
  verse_id_start int not null,
  verse_id_end   int not null,
  translation_id smallint not null references translations,
  note           text,
  created_at     timestamptz not null default now()
);

create table reading_history (
  user_id        uuid not null references auth.users on delete cascade,
  verse_id_start int not null,
  verse_id_end   int not null,
  translation_id smallint not null references translations,
  read_at        timestamptz not null default now()
);
create index rh_user_idx on reading_history (user_id, read_at desc);

create table journal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  body       text not null,                  -- consider app-layer encryption; see note
  created_at timestamptz not null default now()
);

-- Billing truth synced by webhook (Stripe web, RevenueCat mobile). The app
-- reads THIS table only, never the payment provider, for access decisions.
create table entitlements (
  user_id            uuid primary key references auth.users on delete cascade,
  plan               text not null default 'free',
  source             text check (source in ('stripe','app_store','play_store')),
  status             text not null default 'active',
  current_period_end timestamptz,
  external_ref       text,                   -- stripe sub id / RC entitlement id
  updated_at         timestamptz not null default now()
);

-- Free-plan metering
create table usage_events (
  id         bigint primary key generated always as identity,
  user_id    uuid not null references auth.users on delete cascade,
  event      text not null,                  -- 'teacher_message', 'word_study'
  tokens_in  int, tokens_out int,
  created_at timestamptz not null default now()
);
create index usage_user_month_idx on usage_events (user_id, created_at);
```

Journal note: RLS protects rows from other users, not from a database
compromise or an admin. If journals carry confession-grade content, encrypt
`body` at the application layer with a per-user key. Decide before launch;
retrofitting is painful.

### RLS policies

Pattern is identical for every user-zone table. Note the `(select
auth.uid())` wrapping: bare `auth.uid()` re-evaluates per row; the subselect
form is cached per query (initPlan). This is the single biggest documented
RLS performance trap, 100x-class differences at scale.

```sql
alter table studies enable row level security;

create policy studies_owner on studies
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

RLS performance rules (from Supabase's own guidance, verified 2026-07):

- Always wrap auth functions in a subselect as above.
- Always scope policies to `authenticated`; unscoped policies also run for
  anon.
- Index every column a policy references: every user-zone table needs an
  index on `user_id` (messages, saved_passages, etc.), not just its query
  indexes.
- RLS applies row-by-row to vector search results. Corpus tables must stay
  on the cheap public-read policy (or none) so ANN scans are untaxed;
  owner RLS on user_section_embeddings is fine because personal libraries
  are small.
- Test policies from the client SDK; the SQL editor bypasses RLS.

Apply to: profiles, studies, messages, message_citations (via join policy
below), saved_passages, reading_history, journal_entries, entitlements
(select only for owner; insert/update via service role from webhooks),
usage_events (select only; insert via service role).

```sql
-- Tables keyed by a parent row instead of user_id:
create policy citations_owner on message_citations
  for select to authenticated
  using (exists (
    select 1 from messages m
    where m.id = message_id and m.user_id = (select auth.uid())
  ));
```

Corpus zone: enable RLS with a public-read policy so nothing is accidentally
writable from the client:

```sql
alter table sections enable row level security;
create policy sections_read on sections for select using (true);
-- no insert/update/delete policies: writes only via service role
```

Config zone: RLS enabled, zero policies. Only the service role (server-side)
can touch these tables. The client never sees prompts, model routing, or
evals.

## 7. Config zone: model registry and teachers

```sql
create table models (
  id          smallint primary key generated always as identity,
  slug        text not null unique,          -- 'qwen3-32b-ft-2027-03'
  provider    text not null,                 -- 'deepinfra', 'nebius', 'self_hosted'
  endpoint    text not null,
  weight_hash text,                          -- pinned; a model version is a release
  cost_in_per_mtok  numeric, cost_out_per_mtok numeric,
  status      text not null default 'candidate' check (status in
              ('candidate','canary','active','retired'))
);

create table prompt_versions (
  id         bigint primary key generated always as identity,
  slug       text not null,                  -- 'historian'
  version    int not null,
  system_prompt text not null,               -- immutable once created
  unique (slug, version)
);

create table teachers (
  id               smallint primary key generated always as identity,
  slug             text not null unique,     -- 'historian', 'greek-tutor'
  display_name     text not null,
  model_id         smallint not null references models,
  prompt_version_id bigint not null references prompt_versions,
  retrieval_filter jsonb not null,           -- {"source_type":["father","commentary"],"era":[...]}
  contract_version text not null default '1.0',
  canary_model_id  smallint references models,  -- non-null = canary running
  canary_pct       smallint not null default 0,
  is_active        boolean not null default true
);

create table eval_runs (
  id         bigint primary key generated always as identity,
  model_id   smallint not null references models,
  prompt_version_id bigint references prompt_versions,
  suite      text not null,                  -- 'interpretation_bait', 'fidelity',
                                             -- 'citation_accuracy', 'diversity', 'format'
  pass_rate  numeric not null,
  report     jsonb not null,                 -- per-case results
  ran_at     timestamptz not null default now()
);
```

Swapping a model = insert into models, run evals, set canary_model_id +
canary_pct on the teacher, watch verifier rejection rate, then promote by
updating model_id. No deploy.

## 8. Retrieval flow (how a teacher answers)

1. Exact verse-reference parse first ("Rom 8:1-4" bypasses search entirely).
2. Topic alias check: if the query maps to a published topic guide, serve it
   with light personalization. No generation for the fat head.
3. Otherwise hybrid: BM25 (tsv) + vector (section_embeddings) + rerank,
   filtered by the teacher's retrieval_filter, diversified by
   sources.tradition, then generation under the output contract
   (see OUTPUT_CONTRACT.md), then verifier, then persist to messages.

## 9. User library (uploads: PDF, DOCX, EPUB, TXT)

Private per-user mirror of the corpus tables. Structurally separate so the
wall between curated corpus and personal uploads is schema-enforced, not
policy-enforced. See CORPUS.md section 4 for the design decisions.

```sql
create table user_documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  title      text not null,
  author     text,
  file_path  text not null,                  -- storage: library/{user_id}/{id}
  mime       text not null,
  bytes      bigint not null,
  checksum   text not null,
  status     text not null default 'uploaded' check (status in
             ('uploaded','parsing','indexed','failed')),
  error      text,
  created_at timestamptz not null default now(),
  unique (user_id, checksum)                 -- dedupe re-uploads
);

create table user_sections (
  id          bigint primary key generated always as identity,
  document_id uuid not null references user_documents on delete cascade,
  user_id     uuid not null,                 -- denormalized for cheap RLS
  ordinal     int not null,
  heading     text,
  body        text not null,
  tsv         tsvector generated always as (to_tsvector('english', body)) stored,
  unique (document_id, ordinal)
);
create index us_tsv_idx on user_sections using gin (tsv);

create table user_section_anchors (
  section_id     bigint not null references user_sections on delete cascade,
  user_id        uuid not null,
  verse_id_start int not null,
  verse_id_end   int not null,
  primary key (section_id, verse_id_start)
);

create table user_section_embeddings (
  section_id bigint not null references user_sections on delete cascade,
  user_id    uuid not null,
  model_slug text not null,
  embedding  vector(1024) not null,
  primary key (section_id, model_slug)
);
create index use_hnsw_idx on user_section_embeddings
  using hnsw (embedding vector_cosine_ops);
```

RLS: owner-only policy (`auth.uid() = user_id`) on all four tables, same
pattern as section 6. Storage bucket policy scopes `library/{user_id}/` to
its owner. The parse worker uses the service role.

Retrieval: teacher queries union corpus sections with the requesting user's
user_sections when the study has include_library = true. Results carry
origin ('corpus' | 'user_library') through to the output contract so the
client badges provenance.

## 10. Two screen formats (design decision of record)

- Study mode: three-pane workspace. Studies rail, chat, reader panel. Verse
  references in chat populate the reader panel in place.
- Read mode: the word takes the full canvas; study chrome disappears.
  Entered from "Open in Read mode" or the top-level toggle. Exiting returns
  to the study exactly where the user left off (persist scroll/position in
  studies.summary or a small ui_state jsonb on profiles).
- Search is the third top-level mode. Settings live behind the avatar.
