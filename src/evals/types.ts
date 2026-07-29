import type { TeacherResponse } from '../contract/types';
import type { RetrievalContext, VerifierResult } from '../verifier/types';

// A single eval case (OUTPUT_CONTRACT.md §4). YAML files in evals/cases/
// each hold a list of these.
export interface EvalCase {
  id: string;
  suite: string;
  teacher: string;
  prompt: string;
  // Which interpretation rule (I1-I6) the case is engineered to elicit.
  targets?: string;
  expect: Expectation[];
}

// String checks or single-key parameterized checks, as in the spec:
//   expect: [no_verdict, {voices_min: 2}, {traditions_min: 2}, has_passages]
export type Expectation = string | Record<string, number>;

// How the harness obtains a response for a case. Offline today (fixtures),
// a gateway-backed model adapter later.
export interface TeacherAdapter {
  name: string;
  generate(c: EvalCase): Promise<{ response: unknown; retrieval: RetrievalContext } | null>;
}

export interface CaseResult {
  case: EvalCase;
  status: 'pass' | 'fail' | 'pending';
  failures: string[];
  verifier?: VerifierResult;
  response?: TeacherResponse;
}
