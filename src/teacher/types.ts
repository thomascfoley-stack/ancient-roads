import type { TeacherResponse } from '../contract/types';
import type { RankedRow } from '../retrieval/types';
import type { Violation } from '../verifier/types';

export type TeacherResult =
  | { kind: 'composed'; response: TeacherResponse; retrieval: RankedRow[] }
  | { kind: 'fallback'; retrieval: RankedRow[]; violations: Violation[] }
  | { kind: 'empty'; reason: string };
