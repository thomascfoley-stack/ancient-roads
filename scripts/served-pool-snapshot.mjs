#!/usr/bin/env node
// SERVED-POOL SNAPSHOT — READ ONLY (swarm order 2026-08-22 §5.1: the DB-writer lane
// mutates dev concurrently, so measurement items snapshot the served pool at start AND
// end and record drift rather than asserting stale exact counts).
//
// Prints JSON: { host, takenAt, total, bySourceType } for the served pool
// (embeddings WHERE user_id IS NULL AND served), dev only. DEV ONLY: asserts the
// endpoint is ep-tiny-hat and refuses anything matching the production endpoint —
// the swarm order forbids any prod connection, even read-only.
//
//   node scripts/served-pool-snapshot.mjs            # reads web/.env.local
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const raw = readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(
  raw.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const URL_ = env.APP_DATABASE_URL || env.DATABASE_URL;
if (!URL_) { console.error('No DATABASE_URL in web/.env.local'); process.exit(1); }
const HOST = URL_.match(/@([^/:?]+)/)?.[1] ?? '(unparseable)';
if (HOST.includes('odd-fog')) { console.error('ABORT: production endpoint. The swarm order forbids any prod connection.'); process.exit(1); }
if (!HOST.includes('tiny-hat')) { console.error(`ABORT: expected the dev endpoint (ep-tiny-hat), got ${HOST}. Refusing to guess.`); process.exit(1); }

const client = new Client({ connectionString: URL_ });
await client.connect();
const rows = (await client.query(
  `SELECT source_type, COUNT(*)::int AS n FROM embeddings WHERE user_id IS NULL AND served GROUP BY 1 ORDER BY 1`,
)).rows;
const total = (await client.query(
  `SELECT COUNT(*)::int AS n FROM embeddings WHERE user_id IS NULL AND served`,
)).rows[0].n;
await client.end();
console.log(JSON.stringify({ host: HOST.split('.')[0], takenAt: new Date().toISOString(), total, bySourceType: Object.fromEntries(rows.map((r) => [r.source_type, r.n])) }, null, 2));
