-- 0001_init.sql — executable form of docs/SCHEMA.md (Document 1).
-- Target: Postgres 16 on Supabase. Requires the pgvector extension.
-- Zones: corpus (public read, service-role write), user (owner-only RLS),
-- config (service-role only, zero client policies).

create extension if not exists vector;

-- ============================================================
-- 1. Verse identity
-- Canonical verse ID: book * 1_000_000 + chapter * 1_000 + verse.
-- Genesis 1:1 = 1001001. John 3:16 = 43003016.
-- Book numbers: Protestant 66 (Gen=1..Rev=66); 67+ reserved for deuterocanon.
-- Canonical versification = English KJV scheme.
-- ============================================================

create table books (
  book_num      smallint primary key,
  slug          text not null unique,        -- 'gen', 'john'
  name          text not null,
  testament     text not null check (testament in ('OT','NT')),
  chapter_count smallint not null
);

-- Handles Psalm titles, Malachi 3/4, Joel 2/3, etc.
-- Source mapping data from STEPBible TVTMS (CC BY); do not hand-build.
create table versification_map (
  scheme             text not null,          -- 'MT', 'LXX', 'Vulgate'
  scheme_verse_id    int  not null,
  canonical_verse_id int  not null,
  primary key (scheme, scheme_verse_id)
);

-- ============================================================
-- 2. Bible texts
-- ============================================================

create table translations (
  id            smallint primary key generated always as identity,
  slug          text not null unique,        -- 'web', 'kjv', 'bsb', 'sblgnt', 'wlc'
  name          text not null,
  language      text not null,               -- 'en', 'grc', 'hbo'
  versification text not null default 'KJV',
  license       text not null,               -- 'public_domain', 'cc_by', 'licensed'
  license_terms jsonb,                       -- display limits, royalty terms
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

-- ============================================================
-- 4. Corpus: sources and sections
-- (before original-language layer: lexicon_entries references sources)
-- ============================================================

create table sources (
  id           bigint primary key generated always as identity,
  slug         text not null unique,
  title        text not null,
  author       text not null,
  author_died  smallint,                     -- public domain math
  year_written smallint,
  source_type  text not null check (source_type in
    ('commentary','sermon','theology','father','confession','lexicon')),
  tradition    text not null,                -- 'reformed','catholic','orthodox',
                                             -- 'wesleyan','baptist','patristic','lutheran'
  era          text not null,                -- 'patristic','medieval','reformation',
                                             -- 'puritan','modern'
  language     text not null default 'en',
  license      text not null,
  provenance   jsonb                         -- where ingested from, when, checksum
);

create table sections (
  id        bigint primary key generated always as identity,
  source_id bigint not null references sources,
  ordinal   int not null,                    -- reading order within source
  heading   text,
  body      text not null,
  tsv       tsvector generated always as (to_tsvector('english', body)) stored,
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
  section_id bigint not null references sections,
  model_slug text not null,                  -- 'bge-m3-v1'
  embedding  vector(1024) not null,
  primary key (section_id, model_slug)
);
create index se_hnsw_idx on section_embeddings
  using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- 3. Original language layer (word-level)
-- Source: STEPBible TAGNT/TAHOT (CC BY), MorphGNT, OpenScriptures.
-- ============================================================

create table original_words (
  id       bigint primary key generated always as identity,
  verse_id int not null,
  language text not null check (language in ('grc','hbo','arc')),
  position smallint not null,                -- word order within verse
  surface  text not null,                    -- inflected form as written
  lemma    text not null,
  strongs  text,                             -- 'G26', 'H2617'
  morph    text,                             -- parsing code
  gloss    text,                             -- short English gloss
  unique (verse_id, language, position)
);
create index ow_lemma_idx on original_words (lemma);
create index ow_strongs_idx on original_words (strongs);

create table lexicon_entries (
  id        bigint primary key generated always as identity,
  source_id bigint not null references sources, -- Strong's, Thayer, BDB
  strongs   text,
  lemma     text not null,
  language  text not null,
  entry     text not null                    -- full definition text
);
create index lex_strongs_idx on lexicon_entries (strongs);

-- ============================================================
-- 5. Topical guides (the precomputed fat head)
-- ============================================================

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

-- ============================================================
-- 6. User zone (RLS on every table, no exceptions)
-- ============================================================

create table profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  display_name text,
  tradition    text,                         -- weights retrieval, never filters
  translation  smallint references translations,
  plan         text not null default 'free',
  created_at   timestamptz not null default now()
);

-- A study = a channel. UI object and memory object are the same row.
create table studies (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  title           text not null,             -- 'self-control'
  status          text not null default 'active' check (status in ('active','archived')),
  summary         text,                      -- rolling model-written recap
  include_library boolean not null default true,  -- user-library retrieval toggle
  created_at      timestamptz not null default now(),
  last_active     timestamptz not null default now()
);
create index studies_user_idx on studies (user_id, last_active desc);

create table messages (
  id           uuid primary key default gen_random_uuid(),
  study_id     uuid not null references studies on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  role         text not null check (role in ('user','teacher')),
  teacher_slug text,                         -- null for user messages
  content      jsonb not null,               -- user: {text}; teacher: full output contract
  created_at   timestamptz not null default now()
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

-- Journal note: RLS protects rows from other users, not from a database
-- compromise or an admin. If journals carry confession-grade content,
-- encrypt body at the application layer with a per-user key. Decide
-- before launch; retrofitting is painful.
create table journal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  body       text not null,
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
  tokens_in  int,
  tokens_out int,
  created_at timestamptz not null default now()
);
create index usage_user_month_idx on usage_events (user_id, created_at);

-- ============================================================
-- 7. Config zone: model registry and teachers
-- RLS enabled, zero policies: service role only. The client never sees
-- prompts, model routing, or evals.
-- ============================================================

create table models (
  id                smallint primary key generated always as identity,
  slug              text not null unique,    -- 'qwen3-32b-ft-2027-03'
  provider          text not null,           -- 'deepinfra', 'nebius', 'self_hosted'
  endpoint          text not null,
  weight_hash       text,                    -- pinned; a model version is a release
  cost_in_per_mtok  numeric,
  cost_out_per_mtok numeric,
  status            text not null default 'candidate' check (status in
                    ('candidate','canary','active','retired'))
);

create table prompt_versions (
  id            bigint primary key generated always as identity,
  slug          text not null,               -- 'historian'
  version       int not null,
  system_prompt text not null,               -- immutable once created
  unique (slug, version)
);

create table teachers (
  id                smallint primary key generated always as identity,
  slug              text not null unique,    -- 'historian', 'greek-tutor'
  display_name      text not null,
  model_id          smallint not null references models,
  prompt_version_id bigint not null references prompt_versions,
  retrieval_filter  jsonb not null,          -- {"source_type":["father","commentary"],"era":[...]}
  contract_version  text not null default '1.0',
  canary_model_id   smallint references models,  -- non-null = canary running
  canary_pct        smallint not null default 0,
  is_active         boolean not null default true
);

create table eval_runs (
  id                bigint primary key generated always as identity,
  model_id          smallint not null references models,
  prompt_version_id bigint references prompt_versions,
  suite             text not null,           -- 'interpretation_bait', 'fidelity',
                                             -- 'citation_accuracy', 'diversity', 'format'
  pass_rate         numeric not null,
  report            jsonb not null,          -- per-case results
  ran_at            timestamptz not null default now()
);

-- ============================================================
-- 9. User library (uploads: PDF, DOCX, EPUB, TXT)
-- Private per-user mirror of the corpus tables. Structurally separate so
-- the wall between curated corpus and personal uploads is schema-enforced.
-- ============================================================

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

-- ============================================================
-- RLS
-- Performance rules (from Supabase guidance, verified 2026-07):
-- 1. Always wrap auth functions in a subselect: (select auth.uid())
--    is cached per query (initPlan); bare auth.uid() re-evaluates per row.
--    This is a 100x-class difference at scale.
-- 2. Always scope policies to `authenticated`; unscoped policies also
--    run for anon.
-- 3. Index every column a policy references: user_id indexes below.
-- 4. Corpus tables stay on cheap public-read so ANN scans are untaxed.
-- ============================================================

-- User-zone indexes (every column referenced by an RLS policy).
-- PK-based (profiles, entitlements) already have an index.
create index studies_user_id_idx        on studies (user_id);
create index messages_user_id_idx       on messages (user_id);
create index saved_passages_user_id_idx on saved_passages (user_id);
create index reading_history_user_id_idx on reading_history (user_id);
create index journal_entries_user_id_idx on journal_entries (user_id);
create index usage_events_user_id_idx   on usage_events (user_id);
create index user_documents_user_id_idx on user_documents (user_id);
create index user_sections_user_id_idx  on user_sections (user_id);
create index user_section_anchors_user_id_idx on user_section_anchors (user_id);
create index user_section_embeddings_user_id_idx on user_section_embeddings (user_id);

-- Corpus zone: public read, no client writes (writes via service role only).
alter table books               enable row level security;
alter table versification_map   enable row level security;
alter table translations        enable row level security;
alter table verses              enable row level security;
alter table sources             enable row level security;
alter table sections            enable row level security;
alter table section_anchors     enable row level security;
alter table section_embeddings  enable row level security;
alter table original_words      enable row level security;
alter table lexicon_entries     enable row level security;
alter table topics              enable row level security;

create policy books_read              on books              for select using (true);
create policy versification_read      on versification_map  for select using (true);
create policy translations_read       on translations       for select using (true);
create policy verses_read             on verses             for select using (true);
create policy sources_read            on sources            for select using (true);
create policy sections_read           on sections           for select using (true);
create policy section_anchors_read    on section_anchors    for select using (true);
create policy section_embeddings_read on section_embeddings for select using (true);
create policy original_words_read     on original_words     for select using (true);
create policy lexicon_entries_read    on lexicon_entries    for select using (true);
-- Topics: only published guides are client-visible.
create policy topics_read on topics for select using (status = 'published');

-- User zone: owner-only. Subselect pattern + to authenticated on every policy.
alter table profiles         enable row level security;
alter table studies          enable row level security;
alter table messages         enable row level security;
alter table message_citations enable row level security;
alter table saved_passages   enable row level security;
alter table reading_history  enable row level security;
alter table journal_entries  enable row level security;
alter table entitlements     enable row level security;
alter table usage_events     enable row level security;

create policy profiles_owner on profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy studies_owner on studies
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy messages_owner on messages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy saved_passages_owner on saved_passages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy reading_history_owner on reading_history
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy journal_entries_owner on journal_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Keyed by parent row instead of user_id:
create policy citations_owner on message_citations
  for select to authenticated
  using (exists (
    select 1 from messages m
    where m.id = message_id and m.user_id = (select auth.uid())
  ));

-- Entitlements/usage: owner reads; writes via service role (webhooks/metering).
create policy entitlements_owner_read on entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy usage_events_owner_read on usage_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- User library: owner-only on all four tables.
alter table user_documents          enable row level security;
alter table user_sections           enable row level security;
alter table user_section_anchors    enable row level security;
alter table user_section_embeddings enable row level security;

create policy user_documents_owner on user_documents
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_sections_owner on user_sections
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_section_anchors_owner on user_section_anchors
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_section_embeddings_owner on user_section_embeddings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Config zone: RLS enabled, zero policies. Service role only.
alter table models          enable row level security;
alter table prompt_versions enable row level security;
alter table teachers        enable row level security;
alter table eval_runs       enable row level security;
