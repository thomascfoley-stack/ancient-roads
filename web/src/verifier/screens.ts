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

export const SCREENS: Screen[] = [
  // I3/I5: second-person prescriptives
  { rule: 'I3', label: 'second-person prescriptive', pattern: /\byou (should|must|need to|ought to|have to)\b/i },
  { rule: 'I3', label: 'divine prescription to user', pattern: /\bgod (is telling you|wants you to|is calling you to|commands you)\b/i },
  { rule: 'I3', label: 'prescriptive application', pattern: /\bthis means you\b/i },
  // I2: adjudication between views
  { rule: 'I2', label: 'verdict phrase', pattern: /\bthe (correct|right|better|stronger|best) (view|reading|interpretation|position)\b/i },
  { rule: 'I2', label: 'adjudication', pattern: /\b(is|are) (simply |plainly |clearly )?(wrong|mistaken|in error)\b/i },
  // I1: doctrine asserted in the assistant's voice
  { rule: 'I1', label: 'assistant-voice doctrine', pattern: /\bthe bible (clearly |plainly )?(teaches|says|commands|forbids)\b/i },
  { rule: 'I1', label: 'assistant-voice doctrine', pattern: /\bscripture (clearly |plainly )?(teaches|commands|forbids)\b/i },
  { rule: 'I1', label: 'assistant-voice verdict', pattern: /\bthe truth is\b/i },
  // I5: direct doctrinal verdicts
  { rule: 'I5', label: 'doctrinal verdict', pattern: /\b(yes|no), (it|that|this) (is|is not|isn't) (a )?sin\b/i },
  { rule: 'I5', label: 'doctrinal verdict', pattern: /\b(it|this|that) (is|is not|isn't) (a )?sin\b/i },
];

export interface ScreenHit {
  rule: string;
  label: string;
  span: string;
}

export function runScreens(text: string): ScreenHit[] {
  const hits: ScreenHit[] = [];
  for (const s of SCREENS) {
    const m = text.match(s.pattern);
    if (m) hits.push({ rule: s.rule, label: s.label, span: m[0] });
  }
  return hits;
}
