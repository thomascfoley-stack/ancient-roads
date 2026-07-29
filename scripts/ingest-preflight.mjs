#!/usr/bin/env node
// ingest-preflight — the Item 2 entrypoint assert. Aborts (exit 1) unless the
// environment is verifiably the dev branch with a least-privilege runtime role.
// Run before ANY ingestion write, and in any worktree/lane before it writes.
// Asserts (owner-locked, 2026-07-19):
//   1. NEON_BRANCH === 'dev' (literal, from web/.env.local or process.env)
//   2. no 'ep-odd-fog' (prod endpoint) anywhere in web/.env.local
//   3. every DB host contains 'ep-tiny-hat'
//   4. SELECT current_user === 'app_runtime' AND rolbypassrls === false
//   5. empirical RLS: SELECT count(*) FROM highlights returns 0 rows or errors
//   6. migration level 023 markers present (016 history anchors, 019 work col,
//      023 'ingesting' CHECK)
// Never prints secret values. Hosts are echoed (credentials redacted by URL parse).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(repoRoot, 'web', '.env.local');

const fail = [];
const pass = [];

function readEnvFile(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    if (!line.includes('=') || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return { text, env };
}

const { text: envText, env: fileEnv } = readEnvFile(envPath);
const env = (name) => process.env[name] ?? fileEnv[name];

// 1. branch literal
if (env('NEON_BRANCH') === 'dev') pass.push('NEON_BRANCH=dev');
else fail.push(`NEON_BRANCH=${env('NEON_BRANCH') ?? '(unset)'} — expected literal 'dev'`);

// 2. no prod endpoint anywhere in the env file
if (!envText.includes('ep-odd-fog')) pass.push('no ep-odd-fog in web/.env.local');
else fail.push('ep-odd-fog (PROD endpoint) present in web/.env.local — abort');

// 3. every DB host is the dev endpoint
for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'APP_DATABASE_URL']) {
  let host = '(unset)';
  try {
    host = new URL(env(key) ?? '').host;
  } catch {
    host = '(unparseable)';
  }
  if (host.includes('ep-tiny-hat')) pass.push(`${key} host ${host}`);
  else fail.push(`${key} host ${host} — expected ep-tiny-hat*`);
}

const sql = neon(env('APP_DATABASE_URL'));

// 4. role + BYPASSRLS attribute
const role = await sql`select current_user as u`;
if (role[0].u === 'app_runtime') pass.push('current_user=app_runtime');
else fail.push(`current_user=${role[0].u} — expected app_runtime`);
const bypass = await sql`select rolbypassrls from pg_roles where rolname = current_user`;
if (bypass[0].rolbypassrls === false) pass.push('rolbypassrls=false');
else fail.push(`rolbypassrls=${bypass[0].rolbypassrls} — BYPASSRLS defeats every policy`);

// 5. empirical RLS probe: a read policy must deny (0 rows or error) without app.current_user_id
try {
  const rows = await sql`select count(*)::int as n from highlights`;
  if (rows[0].n === 0) pass.push('RLS probe highlights -> 0 rows (denied)');
  else fail.push(`RLS probe highlights -> ${rows[0].n} rows — POLICY DEFEATED`);
} catch (e) {
  pass.push(`RLS probe highlights -> error (denied): ${String(e.message).slice(0, 80)}`);
}

// 6. migration level 023
const markers = await sql`select
  exists(select 1 from information_schema.columns where table_name='commentary_entries' and column_name='work') as m019,
  exists(select 1 from information_schema.tables where table_name='section_history_anchors') as m016,
  exists(select 1 from pg_constraint where pg_get_constraintdef(oid) like '%ingesting%') as m023`;
if (markers[0].m019 && markers[0].m016 && markers[0].m023) {
  pass.push('migration level = 023 (markers 016/019/023 present)');
} else {
  fail.push(`migration markers: 019=${markers[0].m019} 016=${markers[0].m016} 023=${markers[0].m023} — dev is not at 023`);
}

console.log('ingest-preflight (dev asserts):');
for (const s of pass) console.log('  +', s);
if (fail.length) {
  console.log('ABORT:');
  for (const s of fail) console.log('  -', s);
  process.exit(1);
}
console.log('preflight OK — safe to write to dev');
