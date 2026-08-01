// THE ROLLBACK POINTS ARE STILL THERE, AND STILL PROTECTED — deep audit M9.
//
//   NEON_API_KEY=<key> node scripts/assert-protected-branches.mjs
//
// THE FINDING. `docs/PROTECTED_BRANCHES.json` registers `br-late-recipe-atxl68sh` as the
// pre-cutover restore point — "every rollback string in scripts/cutover.mjs names it" — and
// `neon-branch-guard.mjs` exports `refuseProtectedBranchDelete` to stop a script deleting it.
// Measured 2026-08-02: **nothing in the repo calls that function** except its own test, and the
// branch itself was `protected: false` at Neon. So the registry was a declaration with no
// enforcement on either side: no script consults it, and the platform would have allowed the
// delete anyway.
//
// It matters more than a stale guard usually would, because there is no second rollback path.
// PUBLISH_FLIP.md §5 has no restore point ("there is no id here because nothing has been run"),
// Neon fork creation is forbidden by the standing rails, and M7 had left the only database
// rollback refusing to run in exactly the corpus state it exists for.
//
// WHY THIS SHAPE. The guard function protects against a delete that no code performs — a check
// that cannot fire. Bylaw 3 says such a check should be removed or made honest. This makes it
// honest by moving the question from "will our scripts refuse to delete it" to the one that
// actually decides whether a rollback is possible: **does the branch still exist, and is the
// platform refusing to delete it?** That can go red, and it goes red for the real reasons — a
// branch deleted in the console, a protection toggled off, a project rotated.
//
// Protection was turned ON for both the rollback branch and `production` on 2026-08-02 via the
// Neon API. This is what keeps that true.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_NEON_PROJECT, scrubCredentialText } from './lib/neon-connection.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY = path.resolve(HERE, '../docs/PROTECTED_BRANCHES.json');

/** The default branch is a restore point too, and is not in the registry by name. */
const REQUIRE_DEFAULT_PROTECTED = true;

export async function checkProtectedBranches({ apiKey, project = DEFAULT_NEON_PROJECT } = {}) {
  if (!apiKey) throw new Error('NEON_API_KEY is required');
  const res = await fetch(`https://console.neon.tech/api/v2/projects/${project}/branches`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Neon API ${res.status} listing branches for ${project}`);
  const { branches } = await res.json();
  const byId = new Map(branches.map((b) => [b.id, b]));

  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const wanted = registry.branches.map((b) => ({ id: b.id, name: b.name, why: b.rollback_for }));
  if (REQUIRE_DEFAULT_PROTECTED) {
    const def = branches.find((b) => b.default);
    // A registry that happened to be empty would make this pass over nothing; the default branch
    // is always present, so it also serves as the anti-vacuity floor.
    if (def) wanted.push({ id: def.id, name: def.name, why: 'the default branch — production itself' });
  }

  const failures = [];
  for (const w of wanted) {
    const live = byId.get(w.id);
    if (!live) failures.push(`${w.id} (${w.name}) IS GONE from project ${project} — ${w.why}`);
    else if (!live.protected) failures.push(`${w.id} (${live.name}) exists but protected=false — ${w.why}`);
  }
  return { checked: wanted, failures, total: branches.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const apiKey = process.env.NEON_API_KEY;
  try {
    const r = await checkProtectedBranches({ apiKey });
    console.log(`protected-branch check — ${r.checked.length} registered of ${r.total} branches in the project`);
    for (const c of r.checked) console.log(`  ${c.id}  ${c.name}`);
    if (r.failures.length > 0) {
      console.error(`\nFAIL — the rollback path is not what the registry says:\n${r.failures.map((f) => `  • ${f}`).join('\n')}`);
      console.error('\nThere is no second rollback path (PUBLISH_FLIP.md §5, and fork creation is forbidden).');
      process.exit(1);
    }
    console.log('\n\x1b[32m✓ every registered restore point exists and is protected at Neon.\x1b[0m');
  } catch (e) {
    console.error(scrubCredentialText(`protected-branch check could not run: ${e.message}`, apiKey));
    process.exit(2);
  }
}
