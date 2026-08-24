// Exit test for B8 (#111): decodeZld must FAIL CLOSED when a .idx or .zdx
// entry overruns its data file — Buffer.subarray clamps instead of throwing,
// so without a bounds check a corrupt index yields a silently truncated entry.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeZld } from '../src/ingest/sword-ld';

const ENTRY_TEXT = 'A sufficiently long zLD entry body.';

// One-entry zLD module: .zdt holds a single deflated block (count=1, one
// NUL-terminated entry); .dat holds the "KEY\r\n" + u32 block + u32 entry
// record; .idx/.zdx sizes are controllable so tests can claim an overrun.
function writeZldModule(base: string, opts: { idxSize?: number; zdxComp?: number } = {}) {
  const text = Buffer.from(ENTRY_TEXT, 'utf8');
  const headerSize = 4 + 8; // u32 count + one (offset, size) pair
  const blk = Buffer.alloc(headerSize + text.length + 1);
  blk.writeUInt32LE(1, 0);
  blk.writeUInt32LE(headerSize, 4);
  blk.writeUInt32LE(text.length + 1, 8); // size includes the NUL terminator
  text.copy(blk, headerSize);
  const comp = deflateSync(blk);

  const zdx = Buffer.alloc(8);
  zdx.writeUInt32LE(0, 0);
  zdx.writeUInt32LE(opts.zdxComp ?? comp.length, 4);

  const dat = Buffer.alloc(13); // "KEY\r\n" + u32 block + u32 entry
  dat.write('KEY\r\n', 0, 'latin1');
  dat.writeUInt32LE(0, 5);
  dat.writeUInt32LE(0, 9);

  const idx = Buffer.alloc(8);
  idx.writeUInt32LE(0, 0);
  idx.writeUInt32LE(opts.idxSize ?? dat.length, 4);

  writeFileSync(`${base}.idx`, idx);
  writeFileSync(`${base}.dat`, dat);
  writeFileSync(`${base}.zdx`, zdx);
  writeFileSync(`${base}.zdt`, comp);
}

function freshBase(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), 'sword-ld-')), 'mod');
}

describe('sword-ld: decodeZld bounds checks (B8)', () => {
  it('decodes a well-formed one-entry module', () => {
    const base = freshBase();
    writeZldModule(base);
    const entries = decodeZld(base, 'utf8');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe('KEY');
    expect(entries[0]!.text).toContain('sufficiently long zLD entry body');
  });

  it('throws when a .idx entry overruns .dat (subarray clamps — must not silently truncate)', () => {
    const base = freshBase();
    writeZldModule(base, { idxSize: 100 }); // .dat is 13 B
    expect(() => decodeZld(base, 'utf8')).toThrowError(/overruns \.dat/);
  });

  it('throws when a .zdx entry overruns .zdt (clamped slice inflates fine — silent truncation)', () => {
    const base = freshBase();
    writeZldModule(base, { zdxComp: 10000 }); // real compressed block is far smaller
    expect(() => decodeZld(base, 'utf8')).toThrowError(/overruns \.zdt/);
  });
});
