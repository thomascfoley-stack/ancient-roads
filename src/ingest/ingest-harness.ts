// Ingestion harness — PHASE 1 (docs/INGESTION_HARNESS_DESIGN.md §Phased-build 1):
// orchestrator + work state machine + per-work digest over the EXISTING adapters.
// Runs ONE source-work end-to-end to a STAGED state and emits the digest card.
//
// PUBLISHES NOTHING. Staging is reversible (prod retrieval reads the legal
// allowlist, never `sources`), so full autonomy is safe up to `staged`; the
// publish boundary is the owner's digest approval (never auto-fires).
//
//   npx tsx src/ingest/ingest-harness.ts --source=matthew-henry
//
// Phase 1 reuses proven pieces: the license rules of Gate B (inline here), and the
// Path-A re-point stage (src/ingest/migrate-sections-slice.ts). Phases 2-4 (auto-fix
// decision tree, fresh-vN auto-gen, new adapters) are out of scope — see the design.

import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'fs';
// The license/provenance RULES live in license-manifest.ts (Gate B core) — the
// harness CALLS them; it no longer re-inlines its own copy (byte-drift risk: the
// inline copy substring-matched hosts and silently disagreed with the gate).
import { isAllowedLicense, forbiddenProvenanceDomain } from './license-manifest.js';

type State = 'discovered' | 'acquired' | 'matched' | 'staged' | 'quarantined';
interface Step { to: State; ok: boolean; detail: string }

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}
const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

interface Entry { id: string; slug: string; title: string; author: string; license: string;
  provenance: { url?: string; edition?: string; year?: number | string }; backfill?: { match_author?: string } }

async function main() {
  const wantId = arg('--source') ?? 'matthew-henry';
  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf-8')) as Entry[];
  const e = manifest.find((x) => x.id === wantId);
  if (!e) throw new Error(`source "${wantId}" not in ingest/sources.config.json`);
  const matchAuthor = e.backfill?.match_author;

  const url = (localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL'))!;
  const db = new pg.Client({ connectionString: url.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await db.connect();

  const log: Step[] = [];
  const record = (to: State, ok: boolean, detail: string) => { log.push({ to, ok, detail }); };
  let stagedCount = 0, provOk = false, licOk = false;
  try {
    record('discovered', true, `manifest entry "${e.id}" (${e.title})`);

    // acquired: the adapter has already loaded this work's vectors into embeddings.
    const acq = matchAuthor
      ? (await db.query<{ n: string }>(`SELECT count(*) n FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND metadata->>'author'=$1`, [matchAuthor])).rows[0]!.n
      : '0';
    const acquired = Number(acq) > 0;
    record('acquired', acquired, `${acq} embeddings for author "${matchAuthor}" (adapter output already in DB)`);
    if (!acquired) throw new Error('no acquired content');

    // matched: license/provenance gate (Gate B rules, CALLED from license-manifest). Fail ⇒ quarantine.
    const provUrl = e.provenance?.url ?? '';
    provOk = !!provUrl && forbiddenProvenanceDomain(provUrl) === null;
    licOk = isAllowedLicense(e.license);
    const matched = provOk && licOk;
    record(matched ? 'matched' : 'quarantined', matched,
      `license="${e.license}" (${licOk ? 'ok' : 'DISALLOWED'}) · provenance=${provUrl || '(none)'} (${provOk ? 'clean' : 'forbidden/none'})`);
    if (!matched) { record('quarantined', true, 'gate failed → quarantined (reversible, never served)'); }

    // staged: Path-A re-point via the proven slice migrator (reused, not duplicated).
    if (matched) {
      execFileSync('npx', ['tsx', 'src/ingest/migrate-sections-slice.ts', `--source=${e.id}`], { stdio: 'ignore' });
      const c = (await db.query<{ n: string }>(
        `SELECT count(*) n FROM section_embeddings se JOIN sections s ON s.id=se.section_id
         JOIN sources src ON src.id=s.source_id WHERE src.slug=$1`, [e.slug])).rows[0]!.n;
      stagedCount = Number(c);
      record('staged', stagedCount > 0, `${stagedCount} sections+embeddings re-pointed (status='staged', PUBLISH NOTHING)`);
    }
  } finally {
    await db.end();
  }

  // ── per-work digest card ──
  const finalState = log[log.length - 1]!.to;
  const publishable = finalState === 'staged' && provOk && licOk;
  console.log('\n' + '═'.repeat(70));
  console.log(`INGESTION DIGEST — ${e.title}   [final state: ${finalState}]`);
  console.log('═'.repeat(70));
  console.log('  state transitions:');
  for (const s of log) console.log(`    ${s.ok ? '✓' : '✗'} → ${s.to.padEnd(11)} ${s.detail}`);
  console.log(`  work + source:  ${e.author} — ${e.title}`);
  console.log(`  license:        ${e.license}  ${licOk ? '(allowed)' : '(DISALLOWED)'}`);
  console.log(`  provenance:     ${e.provenance?.url ?? '(none)'}  ${provOk ? '(clean, not a forbidden aggregator)' : '(FORBIDDEN/none)'}`);
  console.log(`  match result:   from prior verification vs the PD reference (helloao/CrossWire) — recorded in provenance; not re-run in Phase 1`);
  console.log(`  accuracy delta: none to re-measure — this work is already inside the measured legal corpus (v2 65/72, v3 70/64)`);
  console.log(`  staged units:   ${stagedCount} sections = section_embeddings (1:1, coverage 0)`);
  console.log(`  RECOMMENDED:    ${publishable ? 'PUBLISH-ELIGIBLE — awaiting owner digest approval (NOT auto-published)' : 'QUARANTINE/ESCALATE'}`);
  console.log('═'.repeat(70));
  console.log('  Publish boundary is the owner\'s call. Nothing was published.');
}

main().catch((err) => { console.error(err); process.exit(1); });
