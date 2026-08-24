// Stage V1 regex screens (OUTPUT_CONTRACT.md §3). These run over framing
// text, voice summaries, and prayer_prompt text — the fields written in the
// assistant's own voice. Quotes are exempt: cited sources may say anything.
//
// Each screen maps to an interpretation rule ID (I1-I6), defined in the
// north-star spec docs/PRINCIPLES.md (mirrored in OUTPUT_CONTRACT.md §2).
// Regexes are deliberately blunt; V2 (the classifier) catches what these miss.
// False positives here cost a regeneration, not a user-facing failure.

export interface Screen {
  rule: string; // I1-I6
  label: string;
  pattern: RegExp;
}

// The `g` flag on every pattern is load-bearing: runScreens uses matchAll,
// which requires global patterns. Never call .test()/.exec() on these shared
// module-level RegExps — with `g`, their lastIndex carries between calls and
// silently skips matches (B15/#107).
export const SCREENS: Screen[] = [
  // I3/I5: second-person prescriptives
  { rule: 'I3', label: 'second-person prescriptive', pattern: /\byou (should|must|need to|ought to|have to)\b/gi },
  { rule: 'I3', label: 'divine prescription to user', pattern: /\bgod (is telling you|wants you to|is calling you to|commands you)\b/gi },
  { rule: 'I3', label: 'prescriptive application', pattern: /\bthis means you\b/gi },
  // I2: adjudication between views
  { rule: 'I2', label: 'verdict phrase', pattern: /\bthe (correct|right|better|stronger|best) (view|reading|interpretation|position)\b/gi },
  { rule: 'I2', label: 'adjudication', pattern: /\b(is|are) (simply |plainly |clearly )?(wrong|mistaken|in error)\b/gi },
  // I1: doctrine asserted in the assistant's voice
  { rule: 'I1', label: 'assistant-voice doctrine', pattern: /\bthe bible (clearly |plainly )?(teaches|says|commands|forbids)\b/gi },
  { rule: 'I1', label: 'assistant-voice doctrine', pattern: /\bscripture (clearly |plainly )?(teaches|commands|forbids)\b/gi },
  { rule: 'I1', label: 'assistant-voice verdict', pattern: /\bthe truth is\b/gi },
  // I5: direct doctrinal verdicts
  { rule: 'I5', label: 'doctrinal verdict', pattern: /\b(yes|no), (it|that|this) (is|is not|isn't) (a )?sin\b/gi },
  { rule: 'I5', label: 'doctrinal verdict', pattern: /\b(it|this|that) (is|is not|isn't) (a )?sin\b/gi },
];

export interface ScreenHit {
  rule: string;
  label: string;
  span: string;
}

export function runScreens(text: string): ScreenHit[] {
  const hits: ScreenHit[] = [];
  for (const s of SCREENS) {
    // matchAll (not match/exec) so ALL hits per pattern reach the
    // regeneration hint (B15/#107); identical repeated spans are deduped —
    // repeats of one phrase add noise to the feedback, not information.
    const seen = new Set<string>();
    for (const m of text.matchAll(s.pattern)) {
      const key = m[0].toLowerCase(); // same phrase, any casing, is one fix
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ rule: s.rule, label: s.label, span: m[0] });
    }
  }
  return hits;
}
