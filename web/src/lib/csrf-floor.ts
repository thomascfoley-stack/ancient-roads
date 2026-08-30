// CSRF Content-Type floor for cookie-authenticated mutations (WORKLOG 2026-08-21 deferred
// security finding; the one shipped precedent was inline in plans/[id]/route.ts).
//
// A cross-origin <form> or no-cors fetch can only send the three CORS-safe "simple"
// Content-Types (text/plain, application/x-www-form-urlencoded, multipart/form-data) — any of
// which can deliver a JSON-shaped body to a route that parses one. Requiring application/json
// forces a preflight on every cross-origin caller, which the browser then refuses. The session
// cookie's SameSite posture is recorded as unaudited (2026-08-02 deep audit); until someone
// reads the live Set-Cookie, these routes do not lean on it.
//
// The rejection rides the standard error envelope (docs/API_ERRORS.md): 400 INVALID_REQUEST.
// The registry has no 415 code and the plans/[id] precedent already answered with this shape.
import { apiError } from '@/lib/api-error';

/** 400 INVALID_REQUEST unless the request's Content-Type is application/json; null when it is. */
export function requireJsonContentType(req: Request): Response | null {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return apiError('INVALID_REQUEST', { message: 'Content-Type must be application/json' });
  }
  return null;
}
