// SWORD RawGenBook (TreeKeyIdx) decoder — the general-book sibling of
// sword-zverse.ts, for CrossWire modules like Josephus (ModDrv=RawGenBook).
//
//   npx tsx src/ingest/sword-genbook.ts --module=data/raw/sword/Josephus --out=data/raw/historians/josephus.jsonl
//
// Format (reverse-engineered on josephus.*, validated by consecutive-offset
// arithmetic): three files —
//   <name>.idx  u32LE array; tree pointers are BYTE OFFSETS into this array,
//               each entry holding the node's offset in .dat
//   <name>.dat  node records: [parent:i32][next:i32][firstChild:i32][name\0]
//               [udLen:u16][bdtOffset:u32][size:u16]   (pointers are .idx offsets; -1 = none)
//   <name>.bdt  raw content blobs (ThML for Josephus) at [bdtOffset, +size)
//
// FAIL CLOSED at the decoder mouth on DistributionLicense (license-manifest).

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { isAllowedLicense } from './license-manifest.js';
import { sanitizeForIngest } from './content-sanity.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

export interface GenBookNode {
  path: string[]; // tree path of node names, root-exclusive
  content: string; // markup-stripped text ('' for pure branch nodes)
}

function stripThml(raw: string): string {
  return sanitizeForIngest(
    raw
      .replace(/<scripRef[^>]*>/gi, ' ').replace(/<\/scripRef>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

export function decodeGenBook(moduleDir: string): GenBookNode[] {
  const confPath = readdirSync(path.join(moduleDir, 'mods.d')).find((f) => f.endsWith('.conf'));
  const conf = readFileSync(path.join(moduleDir, 'mods.d', confPath!), 'utf8');
  const get = (k: string) => conf.match(new RegExp(`^${k}=(.*)`, 'mi'))?.[1]?.trim();
  const license = get('DistributionLicense') ?? '';
  if (!isAllowedLicense(license)) {
    throw new Error(`FAIL CLOSED: ${moduleDir} DistributionLicense="${license || '(absent)'}" not allowed — do not decode`);
  }
  if (get('ModDrv')?.toLowerCase() !== 'rawgenbook') {
    throw new Error(`unsupported ModDrv=${get('ModDrv')} (only RawGenBook)`);
  }
  const dataPath = get('DataPath')!.replace(/^\.\//, '');
  // DataPath for genbooks points at the file stem (…/josephus/josephus)
  const stem = path.join(moduleDir, dataPath);
  const base = existsSync(`${stem}.idx`) ? stem : path.join(stem, path.basename(stem));
  const idx = readFileSync(`${base}.idx`);
  const dat = readFileSync(`${base}.dat`);
  const bdt = readFileSync(`${base}.bdt`);

  const datOffsetOf = (idxByteOff: number) => idx.readUInt32LE(idxByteOff);

  interface RawNode { name: string; next: number; firstChild: number; content: string }
  const readNode = (datOff: number): RawNode => {
    const parent = dat.readInt32LE(datOff); void parent;
    const next = dat.readInt32LE(datOff + 4);
    const firstChild = dat.readInt32LE(datOff + 8);
    const nameEnd = dat.indexOf(0, datOff + 12);
    const name = dat.subarray(datOff + 12, nameEnd).toString('utf8');
    const udLen = dat.readUInt16LE(nameEnd + 1);
    let content = '';
    if (udLen >= 6) {
      const off = dat.readUInt32LE(nameEnd + 3);
      const size = dat.readUInt16LE(nameEnd + 7);
      if (size > 0) content = stripThml(bdt.subarray(off, off + size).toString('utf8'));
    }
    return { name, next, firstChild, content };
  };

  const out: GenBookNode[] = [];
  const walk = (idxByteOff: number, trail: string[]): void => {
    let cur: number = idxByteOff;
    while (cur !== -1) {
      const n = readNode(datOffsetOf(cur));
      const p = n.name ? [...trail, n.name] : trail;
      if (n.name) out.push({ path: p, content: n.content });
      if (n.firstChild !== -1) walk(n.firstChild, p);
      cur = n.next;
    }
  };
  const root = readNode(datOffsetOf(0));
  if (root.firstChild !== -1) walk(root.firstChild, []);
  return out;
}

if (process.argv[1] && /sword-genbook/.test(process.argv[1])) {
  const moduleDir = arg('--module');
  const outPath = arg('--out');
  if (!moduleDir || !outPath) throw new Error('usage: sword-genbook.ts --module=<dir> --out=<f.jsonl>');
  const nodes = decodeGenBook(moduleDir);
  writeFileSync(outPath, nodes.map((n) => JSON.stringify(n)).join('\n') + '\n');
  const leaves = nodes.filter((n) => n.content.length > 0);
  console.log(`${path.basename(moduleDir)}: ${nodes.length} nodes, ${leaves.length} with content → ${outPath}`);
  const tops = new Map<string, number>();
  for (const n of leaves) tops.set(n.path[0]!, (tops.get(n.path[0]!) ?? 0) + 1);
  for (const [t, c] of tops) console.log(`  ${t}: ${c} content nodes`);
  for (const s of [leaves[0], leaves[Math.floor(leaves.length / 2)], leaves[leaves.length - 1]]) {
    if (s) console.log(`  sample [${s.path.join(' › ')}]: ${s.content.slice(0, 100)}`);
  }
}
