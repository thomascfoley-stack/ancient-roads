// Transactional mail, over Resend's REST API.
//
// WHY NO SDK. Resend's send endpoint is one POST with a JSON body. An SDK would add a dependency,
// a lockfile entry and an advisory surface to save about eight lines, and this repo regenerates
// `web/package-lock.json` by hand for the deploy upload (the A6 defect class). Boring code, no
// premature abstraction: CLAUDE.md engineering value 4.
//
// WHY THIS EXISTS AT ALL. Until the Better Auth cutover, Neon sent every verification and reset
// mail from its managed service. Self-hosting auth means self-hosting the mail that auth depends
// on: a password-reset flow with no mailer is a button that cannot work.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function isProd(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

export class MailNotConfigured extends Error {}

/**
 * Send one message.
 *
 * ── WHAT HAPPENS WITH NO API KEY, AND WHY IT DIFFERS BY ENVIRONMENT ─────────────────────────────
 * In production, an unset `RESEND_API_KEY` THROWS. A password reset that silently does nothing is
 * worse than one that errors: the user is told to check an inbox that will never receive anything,
 * and nothing anywhere records that it failed. Same posture as the SITE_PASSWORD wall in
 * `middleware.ts` -- one missing env var must fail loudly rather than degrade quietly.
 *
 * Outside production it logs the message to the server console instead, so `pnpm dev` works with no
 * mail account at all. That log includes the action URL, which carries a single-use token -- it is
 * a deliberate developer affordance and it is why this branch can never run in production.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!key || !from) {
    if (isProd()) {
      throw new MailNotConfigured(
        'RESEND_API_KEY and MAIL_FROM are required in production; refusing to report a send that ' +
          'did not happen.',
      );
    }
    console.info(
      `[mail:dev] would send to ${mail.to}\n  subject: ${mail.subject}\n  ${mail.text}`,
    );
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text }),
  });

  if (!res.ok) {
    // The body can echo request detail, so it is not surfaced to the caller or the user. The status
    // is enough to distinguish "bad key" (401) from "bad sender domain" (403) from a provider blip.
    throw new Error(`mail send failed: ${res.status} ${res.statusText}`);
  }
}

/** Plain, quiet, and no tracking pixels. The product's voice, not a marketing template. */
export function actionEmail(heading: string, body: string, cta: string, url: string): Pick<Mail, 'html' | 'text'> {
  return {
    text: `${heading}\n\n${body}\n\n${cta}: ${url}\n\nIf you did not request this, ignore this message.`,
    html:
      `<div style="font-family:Georgia,serif;max-width:34rem;margin:0 auto;padding:2rem 1.25rem;color:#1c1917">` +
      `<h1 style="font-size:1.25rem;font-weight:500;margin:0 0 1rem">${heading}</h1>` +
      `<p style="margin:0 0 1.5rem;line-height:1.6">${body}</p>` +
      `<p style="margin:0 0 1.5rem"><a href="${url}" style="color:#1c1917">${cta}</a></p>` +
      `<p style="margin:0;font-size:.8125rem;color:#78716c">If you did not request this, ignore this message.</p>` +
      `</div>`,
  };
}
