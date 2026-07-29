// ONE checkpoint writer. The orchestrator and the regression gate both go through here.
//
// Why this file exists (deep-audit 2026-07-27, finding 24): `.cutover-checkpoint.json`
// had no lock, no atomic write and no ownership marker, and was clobbered three times
// during the audit — once mid-proof. Two distinct defects:
//
//   1. NON-ATOMIC WRITE. `writeFileSync(path, json)` TRUNCATES the file and then writes.
//      A crash, a full disk or a signal between those two leaves a half-written file that
//      no longer parses — and the checkpoint is the only record of which steps already
//      wrote to production. `rename(2)` within one filesystem is atomic, so we write a
//      sibling temp file and rename it over the target: a reader sees either the whole
//      old file or the whole new one, never a torn one.
//   2. NO OWNERSHIP. Two cutover processes pointed at the same repo would interleave
//      writes with no complaint. The marker records session/pid/host; a SECOND LIVE
//      writer is refused. A dead owner is a resume, not a conflict, so ownership is
//      taken over with a printed notice rather than a hard stop (a crashed run must
//      stay resumable — that is the whole point of the file).
//
// The regression gate runs as a CHILD of the orchestrator and legitimately writes the
// E0 baseline into the same file. It inherits CUTOVER_SESSION_ID through the environment,
// so parent and child share one session and one owner.
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

/** This process's session. Children inherit it via CUTOVER_SESSION_ID. */
export const SESSION_ID = process.env.CUTOVER_SESSION_ID || randomUUID();

/** Prefix on every ownership refusal, so callers can recognize one without string-sniffing. */
export const OWNERSHIP_ERROR = 'CHECKPOINT OWNERSHIP';

export function loadCheckpoint(file) {
  if (!existsSync(file)) return { done: [], baseline: {} };
  const cp = JSON.parse(readFileSync(file, 'utf8'));
  cp.done ??= [];
  cp.baseline ??= {};
  return cp;
}

/** Is `pid` a live process on this host? EPERM means "alive, owned by someone else". */
function isAlive(pid) {
  if (!Number.isInteger(pid)) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/**
 * The owner rule, in one place. A FOREIGN session whose process is still running is a
 * concurrent writer and is refused. A foreign session whose process is gone is a crashed
 * run being resumed — ownership transfers, with a notice, because a crashed cutover must
 * stay resumable. Cross-host ownership cannot be tested by pid, so it is left to the
 * target binding and the operator.
 */
function ownerConflict(owner) {
  if (!owner || owner.session === SESSION_ID) return null;
  if (owner.host === os.hostname() && isAlive(owner.pid)) {
    return `${OWNERSHIP_ERROR}: the checkpoint is owned by a LIVE cutover process ` +
      `(session ${owner.session}, pid ${owner.pid} on ${owner.host}, claimed ${owner.at}). ` +
      `Refusing — two runs sharing one checkpoint is how a step gets marked done that never ran. ` +
      `Wait for that run to finish, or kill it and re-run this one.`;
  }
  return null;
}

/**
 * Refuse to START if a foreign live process owns the checkpoint. Called before anything
 * else: the ownership check must not wait for the first write, because by then the run
 * has already connected, snapshotted and possibly migrated.
 */
export function assertCheckpointOwner(file) {
  if (!existsSync(file)) return;
  const conflict = ownerConflict(JSON.parse(readFileSync(file, 'utf8')).owner);
  if (conflict) throw new Error(conflict);
}

/**
 * Merge-then-atomically-write. Throws if a FOREIGN LIVE writer owns the file.
 *
 * MERGE, never blind-overwrite: the gate runs as a child process and writes
 * `baseline.regression` into this same file, while the parent holds an older copy in
 * memory. A blind write from either side destroys the other's work — which is exactly
 * how the E0 baseline went missing and G1 silently became a check that could not fail.
 */
export function saveCheckpoint(file, cp) {
  const onDisk = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const owner = onDisk?.owner;
  const conflict = ownerConflict(owner);
  if (conflict) throw new Error(conflict);
  if (owner && owner.session !== SESSION_ID) {
    console.log(`  (checkpoint: taking ownership from a dead session ${owner.session} / pid ${owner.pid} — treating this as a resume)`);
  }

  const merged = { ...(onDisk ?? {}), ...cp };
  merged.done = [...new Set([...(onDisk?.done ?? []), ...(cp.done ?? [])])];
  merged.baseline = { ...(onDisk?.baseline ?? {}), ...(cp.baseline ?? {}) };
  merged.owner = { session: SESSION_ID, pid: process.pid, host: os.hostname(), at: new Date().toISOString() };

  // tmp + rename: a reader sees the whole old file or the whole new one, never a torn one.
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, JSON.stringify(merged, null, 2));
    renameSync(tmp, file);
  } catch (e) {
    if (existsSync(tmp)) { try { unlinkSync(tmp); } catch { /* the rename already consumed it */ } }
    throw e;
  }
  // Keep the caller's in-memory copy consistent with what is now on disk.
  cp.done = merged.done;
  cp.baseline = merged.baseline;
  return merged;
}
