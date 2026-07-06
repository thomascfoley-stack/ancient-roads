// Eval harness runner (OUTPUT_CONTRACT.md §4). Loads every YAML case file in
// evals/cases/, obtains a response per case from the adapter, runs the V1
// verifier + expectation checks, and prints a per-suite report.
//
// Today the only adapter is fixture-backed (evals/fixtures/<case-id>.json,
// shape {response, retrieval}); cases without a fixture report as pending.
// When the model gateway exists, add an adapter that calls it and gate
// promotion on the suite thresholds in OUTPUT_CONTRACT.md.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { verifyV1 } from '../verifier/v1.js';
import { createMemoryCorpus } from '../verifier/memory-corpus.js';
import type { MemoryCorpusData } from '../verifier/memory-corpus.js';
import type { TeacherResponse } from '../contract/types.js';
import { runExpectation } from './checks.js';
import type { CaseResult, EvalCase, TeacherAdapter } from './types.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CASES_DIR = path.join(ROOT, 'evals/cases');
const FIXTURES_DIR = path.join(ROOT, 'evals/fixtures');

// The shared eval corpus fixture: sections the fixture responses cite.
async function loadEvalCorpus() {
  const raw = await readFile(path.join(FIXTURES_DIR, 'corpus.json'), 'utf8');
  return createMemoryCorpus(JSON.parse(raw) as MemoryCorpusData);
}

const fixtureAdapter: TeacherAdapter = {
  name: 'fixtures',
  async generate(c) {
    try {
      const raw = await readFile(path.join(FIXTURES_DIR, `${c.id}.json`), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
};

async function loadCases(): Promise<EvalCase[]> {
  const files = (await readdir(CASES_DIR)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  const cases: EvalCase[] = [];
  for (const file of files.sort()) {
    const parsed = parse(await readFile(path.join(CASES_DIR, file), 'utf8')) as EvalCase[];
    cases.push(...parsed);
  }
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`duplicate case id: ${c.id}`);
    ids.add(c.id);
  }
  return cases;
}

async function main() {
  const cases = await loadCases();
  const corpus = await loadEvalCorpus();
  const results: CaseResult[] = [];

  for (const c of cases) {
    const generated = await fixtureAdapter.generate(c);
    if (!generated) {
      results.push({ case: c, status: 'pending', failures: [] });
      continue;
    }
    const verifier = await verifyV1(generated.response, corpus, generated.retrieval);
    const failures: string[] = [];
    if (!verifier.ok && !c.expect.includes('verifier_fail_expected')) {
      // Schema-invalid responses can't run content expectations meaningfully.
      if (verifier.violations.some((v) => v.check === 'schema')) {
        failures.push(`schema: ${verifier.violations.map((v) => v.message).join('; ')}`);
      }
    }
    if (failures.length === 0) {
      const response = generated.response as TeacherResponse;
      for (const expectation of c.expect) {
        const failure = runExpectation(expectation, response, verifier);
        if (failure) failures.push(failure);
      }
    }
    results.push({
      case: c,
      status: failures.length === 0 ? 'pass' : 'fail',
      failures,
      verifier,
    });
  }

  // Per-suite report.
  const suites = new Map<string, CaseResult[]>();
  for (const r of results) {
    const list = suites.get(r.case.suite) ?? [];
    list.push(r);
    suites.set(r.case.suite, list);
  }

  let anyFail = false;
  for (const [suite, list] of [...suites.entries()].sort()) {
    const pass = list.filter((r) => r.status === 'pass').length;
    const fail = list.filter((r) => r.status === 'fail').length;
    const pending = list.filter((r) => r.status === 'pending').length;
    const scored = pass + fail;
    const rate = scored > 0 ? `${((pass / scored) * 100).toFixed(1)}%` : 'n/a';
    console.log(`${suite}: ${pass} pass, ${fail} fail, ${pending} pending (pass rate ${rate})`);
    for (const r of list) {
      if (r.status === 'fail') {
        anyFail = true;
        console.log(`  ✗ ${r.case.id}: ${r.case.prompt.slice(0, 70)}`);
        for (const f of r.failures) console.log(`      ${f}`);
      }
    }
  }
  const pendingTotal = results.filter((r) => r.status === 'pending').length;
  if (pendingTotal > 0) {
    console.log(`\n${pendingTotal} case(s) pending: no fixture response yet (expected until the first teacher exists).`);
  }
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
