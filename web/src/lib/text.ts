/** Cap `s` at `max` Unicode CODE POINTS (spread iteration), never mid–surrogate-pair —
 *  String.slice counts UTF-16 code units and a split pair persists as U+FFFD (bug #120).
 *  Code points, not grapheme clusters: a ZWJ sequence (family emoji, flags) can still split. */
export function truncateCodePoints(s: string, max: number): string {
  return s.length <= max ? s : [...s].slice(0, max).join('');
}
