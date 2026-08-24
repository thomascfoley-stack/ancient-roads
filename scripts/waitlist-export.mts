// WAITLIST EXPORT — the list, as CSV, from the owner's own database.
//
// This is what "the data belongs to ME" means in practice: one command, no vendor, no dashboard,
// no export request. It is also the ONLY intended reader of `waitlist` — `app_runtime` holds
// INSERT and nothing else (033/034), so the running app can add a signup and can never enumerate
// the list. That posture is deliberate and this script does not weaken it; it connects as owner.
//
//   DATABASE_URL=<owner-url> npx tsx scripts/waitlist-export.mts > list.csv
//   DATABASE_URL=<owner-url> npx tsx scripts/waitlist-export.mts --campaign jan-newsletter
//   DATABASE_URL=<owner-url> npx tsx scripts/waitlist-export.mts --since 2026-08-01
//
// DE-DUPLICATION HAPPENS HERE, not in a constraint. `waitlist` is an append-only signup log
// (migration 130): every submission is a row, so a person who signs up twice from two campaigns
// keeps both touches. DISTINCT ON collapses that to one row per address at FIRST touch — the
// campaign that actually earned the signup.
//
// SUPPRESSED ADDRESSES ARE EXCLUDED, always and by default. Anyone who unsubscribed or complained
// is filtered out here, at the source, so a list built by this script cannot re-mail them even if
// the sending provider is swapped or restored from an old backup. There is deliberately no flag
// to include them.

import pg from 'pg';
import { createHash } from 'node:crypto';

const url = (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
if (!url) {
  console.error('DATABASE_URL (owner role) required');
  process.exit(1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const campaign = arg('campaign');
const since = arg('since');

/** RFC4180-ish: quote everything, double internal quotes. Addresses and campaign names are not
 *  trusted to be comma-free, and a CSV that breaks on one row is worse than no CSV. */
function csv(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  const { rows } = await c.query(
    // created_at is formatted in SQL as ISO-8601 UTC. Letting the driver hand back a JS Date makes
    // the CSV render in the exporting machine's locale ("Thu Jul 16 2026 … GMT-0700"), which is
    // both unparseable by most tools and different depending on who ran the export.
    `SELECT f.email,
            to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            f.attribution->>'utm_source'   AS utm_source,
            f.attribution->>'utm_medium'   AS utm_medium,
            f.attribution->>'utm_campaign' AS utm_campaign,
            f.attribution->>'referrer_host' AS referrer_host,
            f.attribution->>'landing_path'  AS landing_path,
            f.source, f.consent_text
       FROM (SELECT DISTINCT ON (email) * FROM waitlist ORDER BY email, created_at) f
      WHERE ($1::text IS NULL OR f.attribution->>'utm_campaign' = $1)
        AND ($2::timestamptz IS NULL OR f.created_at >= $2)
        -- Suppression is enforced in the export itself; see the header.
        AND NOT EXISTS (
          SELECT 1 FROM email_suppression s WHERE s.email_hash = encode(sha256(lower(f.email)::bytea), 'hex')
        )
      ORDER BY f.created_at`,
    [campaign ?? null, since ?? null],
  );

  const cols = ['email', 'created_at', 'utm_source', 'utm_medium', 'utm_campaign', 'referrer_host', 'landing_path', 'source', 'consent_text'];
  console.log(cols.join(','));
  for (const r of rows) console.log(cols.map((k) => csv((r as Record<string, unknown>)[k])).join(','));

  // Progress to stderr so `> list.csv` stays clean.
  console.error(`\n${rows.length} address(es) exported${campaign ? ` for campaign ${campaign}` : ''}${since ? ` since ${since}` : ''}, suppressed excluded.`);
  // Sanity line the owner can eyeball: the hash of a known address, so it is obvious HOW
  // suppression matching works if they ever need to add one by hand.
  if (rows.length > 0) {
    const sample = String((rows[0] as Record<string, unknown>).email);
    console.error(`(suppression matches sha256(lower(email)); e.g. ${sample.replace(/^(.).*(@.*)$/, '$1***$2')} -> ${createHash('sha256').update(sample.toLowerCase()).digest('hex').slice(0, 12)}…)`);
  }
} finally {
  await c.end();
}
