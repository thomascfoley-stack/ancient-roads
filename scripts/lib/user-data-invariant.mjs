// ONE definition of the user-data invariant. The orchestrator (.mjs, @neondatabase/
// serverless) and the regression gate (.mts, node-postgres) both build their SQL here,
// so the two can never drift into measuring different properties.
//
// Why this file exists (deep-audit 2026-07-27, findings 6 and 7): the invariant was
// `count(*)` + `count(DISTINCT user_id)`. THREE seeded corruptions passed it green on a
// prod fork:
//   (i)   soft-delete every visible annotation  — 34 rows / 6 users, unchanged
//   (ii)  reassign every highlight to a different owner (a cross-user leak)
//                                              — 34 rows / 6 users, unchanged
//   (iii) repoint every anchor at one verse, clear the spans
//                                              — 34 rows / 6 users, unchanged
// A count is a proxy. The property is "these exact rows, owned by these exact people,
// pointing at these exact places, still say the same thing." So we measure:
//   * a per-table md5 DIGEST over ordered rows — id, user_id, the anchor columns, the
//     tombstone, and a hash of the body/appearance columns. Catches (i), (ii) and (iii).
//   * an ACTIVE row count (`deleted_at IS NULL`) — prod holds 34 highlight rows of which
//     only 24 are active, so "34 unchanged" holds even if every visible annotation is
//     soft-deleted. Catches (i) on its own, in a number a human can read.
//   * OWNER DISTRIBUTION (rows per user_id) — catches (ii) on its own, likewise.
// The user ids are hashed before they are recorded: the checkpoint is a file in the
// repo tree, and an account id has no business being written into it. Hashing keeps the
// distribution keyed by identity (so a permutation still shows) without storing the id.
//
// Columns are DECLARED, not discovered. Discovering them from information_schema would
// make a dropped column silently narrow the digest and stay green; with a fixed list a
// dropped column makes the query error, which is a red gate. Migrations 016-030 only ADD
// columns to these tables, so the pre-016 list is stable across the whole cutover — and
// deliberately excludes 025's target_kind/section_id, which the cutover legitimately
// changes.
//
// USER_TABLES is derived from USER_TABLE_SPEC — never hand-maintained (2026-07-29 glob
// ruling). test/invariants/user-data-invariant.test.ts enumerates user-scoped tables from
// db/schema.sql + db/migrations/ and fails if any is absent from USER_TABLE_SPEC or
// USER_TABLE_EXCLUDED.

/** Tables measured by G1 digest — derived from USER_TABLE_SPEC; never hand-maintained. */
export const USER_TABLE_EXCLUDED = {
  api_rate_limit:
    'Operational fixed-window rate-limit counters, not user-readable content (migration 008; no RLS).',
  embeddings:
    'Mixed platform corpus (user_id IS NULL) and optional user uploads; G1 inventory tracks annotation/social/profile tables, not the vector store.',
  sources: 'Corpus catalog — platform content, not per-user rows (migration 006).',
  sections: 'Corpus sections — platform content, not per-user rows (migration 006).',
  section_anchors: 'Corpus anchor rows — platform content (migration 006).',
  section_embeddings: 'Corpus vectors — platform content (migration 006).',
  section_history_anchors: 'Historian-register anchors — platform content (migration 016).',
  commentary_entries: 'Legacy commentary FTS store — platform content (migration 003).',
  schema_migrations:
    'Migration ledger — filenames, timestamps and the applying role (migration 032). No user data, ' +
    'and app_runtime holds SELECT only. Added by the 2026-08-02 audit (M18); this list is enforced, ' +
    'so the table could not be introduced without classifying it, which is the invariant working.',

  // ── The four Better Auth tables (migration 104, the SEC-1 cutover) ────────────────────────────
  // EXCLUDED from the G1 digest, and the distinction is worth stating precisely: these hold data
  // ABOUT users, but they are not user CONTENT. G1 exists to prove that a cutover did not silently
  // rewrite, reassign or erase what people wrote (the three seeded corruptions in this file's
  // header). Auth rows are churn by design -- every sign-in writes a session, every sign-out
  // deletes one -- so a digest over them would go red on normal use and be muted within a week,
  // taking the tables that matter with it.
  //
  // They are also the wrong shape for it: the digest is keyed on `user_id`, and these use Better
  // Auth's quoted camelCase `"userId"`. A spec entry would silently measure nothing.
  //
  // What DOES check them is `web/test/invariants/better-auth-schema.test.ts`: the columns are
  // derived from Better Auth's own `getAuthTables()` and compared against the migration, and no
  // module outside `web/src/lib/auth/` may reference the tables at all.
  auth_users:
    'Better Auth identity rows (migration 104). Auth infrastructure, not user content; see the ' +
    'note above. Checked by better-auth-schema.test.ts, not by the G1 digest.',
  auth_sessions:
    'Better Auth session rows (migration 104). Written on every sign-in and deleted on sign-out, ' +
    'so a content digest over them is meaningless by construction.',
  auth_accounts:
    'Better Auth credential rows (migration 104) -- holds the bcrypt password hashes. Deliberately ' +
    'outside the digest: hashing them into a repo-tracked checkpoint is exactly what this file ' +
    'refuses to do with account ids, for the same reason.',
  auth_verifications:
    'Better Auth single-use verification and reset tokens (migration 104). Short-lived by design ' +
    'and never user-readable content.',
};

export const USER_TABLE_SPEC = {
  highlights: {
    anchor: ['verse_id', 'verse_end', 'span_start', 'span_end'],
    tombstone: 'deleted_at',
    active: 'deleted_at IS NULL',
    body: ['color', 'background_color', 'text_color', 'translation'],
  },
  notes: {
    anchor: ['verse_id', 'verse_end'],
    tombstone: 'deleted_at',
    active: 'deleted_at IS NULL',
    body: ['body'],
  },
  // `chats` carries no tombstone and no anchor; is_archived is its visibility switch.
  chats: {
    anchor: [],
    tombstone: null,
    active: 'is_archived IS NOT TRUE',
    body: ['title', 'persona', 'icon_color', 'sort_order'],
  },
  // Public signup list — no user_id, no deleted_at; every row is live.
  waitlist: {
    hasUserId: false,
    anchor: ['email', 'source', 'created_at'],
    tombstone: null,
    active: 'true',
    body: [],
  },
  // Study groups — user-scoped, no tombstone; every row is live.
  channels: {
    anchor: ['created_at'],
    tombstone: null,
    active: 'true',
    body: ['name', 'description', 'icon', 'pinned_sources', 'settings', 'sort_order'],
  },
  messages: {
    anchor: ['channel_id', 'chat_id', 'role', 'created_at'],
    tombstone: null,
    active: 'true',
    body: ['content', 'sources', 'metadata'],
  },
  bookmarks: {
    anchor: ['target_kind', 'verse_id', 'section_id', 'source_content_hash'],
    tombstone: 'deleted_at',
    active: 'deleted_at IS NULL',
    body: ['label'],
  },
  library_items: {
    anchor: ['source_id', 'created_at'],
    tombstone: null,
    active: 'true',
    body: ['shelf', 'updated_at'],
  },
  reading_progress: {
    anchor: ['source_id', 'last_ordinal'],
    tombstone: null,
    active: 'true',
    body: ['char_offset', 'percent', 'updated_at'],
  },
  tags: {
    anchor: ['name', 'created_at'],
    tombstone: null,
    active: 'true',
    body: [],
  },
  annotation_tags: {
    anchor: ['tag_id', 'target_type', 'target_id', 'created_at'],
    tombstone: null,
    active: 'true',
    body: [],
  },
  user_profiles: {
    ownerColumn: 'auth_user_id',
    anchor: ['created_at'],
    tombstone: null,
    active: 'true',
    body: ['display_name', 'avatar_url', 'preferred_translation', 'encryption_key_hash', 'plan', 'updated_at'],
  },
  user_library: {
    anchor: ['created_at'],
    tombstone: null,
    active: 'true',
    body: ['title', 'file_type', 'storage_key', 'size_bytes', 'mime_type', 'is_purchased', 'metadata'],
  },
  user_integrations: {
    anchor: ['provider', 'composio_account_id', 'created_at'],
    tombstone: null,
    active: 'true',
    body: ['status', 'scopes', 'updated_at'],
  },
  chat_memories: {
    anchor: ['chat_id', 'fact_type', 'created_at'],
    tombstone: null,
    active: 'is_active IS TRUE',
    body: ['content', 'verse_refs', 'confidence', 'updated_at'],
  },
  reading_history: {
    anchor: ['book_slug', 'chapter', 'translation', 'read_at'],
    tombstone: null,
    active: 'true',
    body: ['time_spent_ms'],
  },
  study_guides: {
    anchor: ['channel_id', 'created_at'],
    tombstone: null,
    active: 'true',
    body: ['title', 'topic', 'description', 'sections', 'progress', 'is_template', 'updated_at'],
  },

  // ── Slice 1's personal corpus (migrations 100/102/103) ────────────────────────────────────────
  // These are USER DATA in the fullest sense — a pastor's unpublished sermon manuscripts — so they
  // belong in the spec, not the exclusion list. Registering them means corpus-copy.mjs asserts it
  // never copies them, and the cutover regression gate digests them so they provably survive.
  //
  // All four hard-delete via the FK cascade (document -> sections -> {embeddings, anchors}), so
  // there is no tombstone and every row is live.
  user_documents: {
    anchor: ['checksum', 'created_at'],
    tombstone: null,
    active: 'true',
    // `attempts` and `claimed_at` are deliberately OUT of the body: they are queue mechanics that
    // change on every drain tick, and including them would make the digest churn against a
    // pre-cutover baseline for reasons that have nothing to do with user data surviving.
    body: ['title', 'doc_type', 'source_filename', 'blob_url', 'byte_size', 'status', 'parse_error',
      'mime_type', 'page_count', 'extractable_chars'],
  },
  user_sections: {
    anchor: ['document_id', 'ordinal', 'created_at'],
    tombstone: null,
    active: 'true',
    body: ['heading', 'body', 'kind'],
  },
  user_section_embeddings: {
    idColumns: ['section_id', 'model_slug'], // composite PK; no `id` column (migration 100)
    anchor: ['section_id', 'model_slug'],
    tombstone: null,
    active: 'true',
    // The vector itself is not in the body: 1024 floats per row would dominate the digest cost
    // for no gain, and (section_id, model_slug) already identifies it. A vector that changed
    // under a fixed section+model would be a model-parity breach, which ADR-102's check owns.
    body: [],
  },
  user_section_anchors: {
    idColumns: ['section_id', 'verse_id_start', 'channel'], // composite PK (migration 103)
    anchor: ['section_id', 'verse_id_start', 'verse_id_end', 'channel'],
    tombstone: null,
    active: 'true',
    body: ['match_count', 'confidence'],
  },
};

/** Derived from USER_TABLE_SPEC — do not hand-edit. */
export const USER_TABLES = Object.keys(USER_TABLE_SPEC).sort();

// NULL and '' must not hash alike, and a NULL must not shift the field positions the
// way concat_ws() would by dropping it.
const nn = (c) => `coalesce(${c}::text, '<NULL>')`;
const FS = `E'\\x1f'`; // field separator, a control char that cannot occur in a uuid
const RS = `E'\\x1e'`; // record separator

// ROW IDENTITY IS DECLARED, like the columns above and for the same reason.
// It defaulted to a hardcoded 'id' in both the identity list and the ORDER BY,
// which is true of every table classified before 2026-08-03 and FALSE of the
// two junction tables migration 100 added: user_section_embeddings keys on
// (section_id, model_slug) and user_section_anchors on (section_id,
// verse_id_start, channel), and neither has an `id`. measureSql would raise
// 42703, which cutover.mjs reports as "a column this invariant covers has been
// dropped or renamed ... restore from the pre-cutover snapshot" — a false
// schema-regression verdict on a healthy database. Declaring idColumns keeps
// the default byte-identical for every pre-existing table (so no committed
// digest baseline moves) and makes a composite-PK table measurable rather than
// fatal.
//
// CONCURRENCY NOTE: Lane A's uncommitted /plans work introduces this same
// helper, with the same name, default and dedupe, for plan_days and
// plan_day_readings. It is replicated here rather than invented differently so
// the merge is "both added the same thing" instead of two divergent designs.
// Expect a textual conflict at merge that resolves by taking either side.
const idColumnsOf = (s) => s.idColumns ?? ['id'];

/** Per-table counts + active count + the ordered-row md5 digest, in one round trip. */
export function measureSql(table) {
  const s = USER_TABLE_SPEC[table];
  if (!s) throw new Error(`no user-data spec for table ${table}`);
  const ownerCol = s.ownerColumn ?? 'user_id';
  const ids = idColumnsOf(s);
  const seen = new Set();
  const identity = (s.hasUserId === false
    ? [...ids, ...s.anchor, ...(s.tombstone ? [s.tombstone] : [])]
    : [...ids, ownerCol, ...s.anchor, ...(s.tombstone ? [s.tombstone] : [])]
  ).filter((c) => !seen.has(c) && seen.add(c)).map(nn);
  const body = s.body.length > 0 ? [`md5(${s.body.map(nn).join(` || ${FS} || `)})`] : [];
  const rowExpr = [...identity, ...body].join(` || ${RS} || `);
  const usersCol = s.hasUserId === false
    ? '0::int AS users'
    : `count(DISTINCT ${ownerCol})::int AS users`;
  return `SELECT count(*)::int AS rows,
                 ${usersCol},
                 count(*) FILTER (WHERE ${s.active})::int AS active,
                 coalesce(md5(string_agg(md5(${rowExpr}), '' ORDER BY ${ids.map((c) => `${c}::text`).join(', ')})), 'EMPTY') AS digest
            FROM ${table}`;
}

/** rows-per-owner, keyed by a truncated hash of the account id (never the id itself). */
export function ownersSql(table) {
  const s = USER_TABLE_SPEC[table];
  if (s?.hasUserId === false) {
    return `SELECT NULL::text AS owner, 0::int AS n WHERE false`;
  }
  const ownerCol = s.ownerColumn ?? 'user_id';
  return `SELECT substr(md5(${ownerCol}), 1, 12) AS owner, count(*)::int AS n
            FROM ${table} GROUP BY 1 ORDER BY 1`;
}

/** The shape used when a table does not exist yet on the target. */
export const ABSENT = { rows: -1, users: -1, active: -1, digest: 'ABSENT', owners: {} };

const ownersOf = (m) => Object.entries(m.owners ?? {}).map(([k, v]) => `${k}:${v}`).join(',');

/** One-line human summary — what gets printed at every step. */
export function userShape(m) {
  return USER_TABLES.map((t) => {
    const x = m[t] ?? ABSENT;
    return `${t}=${x.rows}r/${x.active}a/${x.users}u/${String(x.digest).slice(0, 8)}`;
  }).join(' ');
}

/**
 * Every way `now` differs from `base`, as human sentences. Empty array == unchanged.
 * Compares counts, ACTIVE counts, the digest and the owner distribution — the digest
 * alone would catch all three seeded corruptions, but a bare "digest changed" tells an
 * operator nothing about what moved, and this file's job at 3am is to say what moved.
 */
export function diffUserData(base, now) {
  const out = [];
  for (const t of USER_TABLES) {
    const b = base?.[t], n = now?.[t];
    if (!b) continue; // no E0 reading for this table; nothing to compare against
    // A table that WAS measured at E0 and is now absent from the reading is a
    // difference, not a skip. Skipping it printed a green "unchanged" line off a reading
    // that had failed — the exact false-green this round exists to close.
    if (!n) { out.push(`${t}: NOT MEASURED in the current reading (the measurement failed)`); continue; }
    if (b.rows !== n.rows) out.push(`${t}: row count ${b.rows} -> ${n.rows}`);
    if (b.users !== n.users) out.push(`${t}: distinct owners ${b.users} -> ${n.users}`);
    if (b.active !== n.active) out.push(`${t}: ACTIVE rows ${b.active} -> ${n.active} (soft-delete or un-delete)`);
    if (b.digest !== n.digest) out.push(`${t}: DIGEST ${String(b.digest).slice(0, 8)} -> ${String(n.digest).slice(0, 8)} (row identity/anchor/body changed)`);
    const bo = ownersOf(b), no = ownersOf(n);
    if (bo !== no) out.push(`${t}: OWNER DISTRIBUTION ${bo || '(none)'} -> ${no || '(none)'} (rows changed hands)`);
  }
  return out;
}
