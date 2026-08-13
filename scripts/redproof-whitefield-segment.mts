import { readFileSync } from 'node:fs';
import { segmentVolume } from '../src/ingest/profile-whitefield-works.js';

const raw = readFileSync('data/raw/gutenberg/77034.txt', 'utf8');
const sane = segmentVolume(5, raw);
console.log(`sane vol 5: ${sane.length} sermons (expect 31)`);

// RED 1: destroy the BODY stated-ref line of SERMON XXVI (the file carries a
// second copy in the CONTENTS page — corrupt the one after the heading).
const at = raw.lastIndexOf('SERMON XXVI.'); // body heading (ToC occurrence comes first)
const broken = raw.slice(0, at) + raw.slice(at).replace('MATTHEW xxv. 46.', 'MATTHEW xxv. fourty-six.');
try {
  segmentVolume(5, broken);
  console.log('RED-PROOF 1 FAILED: corrupted stated ref segmented without error');
  process.exit(1);
} catch (e) {
  console.log(`red-proof 1 OK (threw): ${(e as Error).message.slice(0, 100)}`);
}

// RED 2: destroy one boundary heading -> the unit must vanish (30, not 31),
// which segmentWhitefieldWorks' I–LIX sequence assertion then rejects.
const skipped = raw.replace(/\n\s*SERMON III\.\r?\n/, '\nSERMON IIIA.\n');
const s2 = segmentVolume(5, skipped);
console.log(`red-proof 2: boundary destroyed -> ${s2.length} sermons (31 expected; 30 = the unit vanished and the sequence assertion fails closed)`);
if (s2.length !== 30) { console.log('RED-PROOF 2 FAILED: expected the destroyed boundary to drop a unit'); process.exit(1); }
