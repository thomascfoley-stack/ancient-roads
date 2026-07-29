// Structured event logging for beta observability (docs/OBSERVABILITY_DESIGN.md).
// One JSON line per event to stdout; the platform log drain (Vercel) captures and
// makes them queryable/alertable. Edge- and Node-safe (console only).
//
// NO-SECRETS CONTRACT (hard rule): callers must never pass secrets, tokens,
// passwords, cookie values, or raw question text. Log codes, counts, outcomes,
// and the opaque internal userId. The logger adds nothing but `evt` + `ts`, so it
// cannot introduce ambient secrets of its own.

export type ObsEvent =
  | 'rate_limit_hit'
  | 'rate_limit_fail_open'
  | 'gate_rate_limit_hit'
  | 'gate_locked'
  | 'ask_outcome'
  | 'waitlist_signup'
  | 'error';

export type ObsFields = Record<string, string | number | boolean>;

export function logEvent(evt: ObsEvent, fields: ObsFields = {}): void {
  let line: string;
  try {
    line = JSON.stringify({ evt, ts: new Date().toISOString(), ...fields });
  } catch {
    // A field wasn't serializable — emit the event without fields rather than throw.
    line = JSON.stringify({ evt, ts: new Date().toISOString() });
  }
  console.log(line);
}
