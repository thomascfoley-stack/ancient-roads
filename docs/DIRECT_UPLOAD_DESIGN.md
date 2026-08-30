# Direct-to-Blob Upload Design

**Problem:** Vercel's platform body cap rejects uploads over ~4 MB before the
serverless function runs (413 confirmed on production, `docs/evidence/f134-probe-2026-08-30.txt`).
`middlewareClientMaxBodySize: '25mb'` governs the middleware layer only, not the
function body limit. The current upload route (`/api/user-corpus/upload`) cannot
accept files over ~4 MB regardless of configuration.

**Goal:** Restore the advertised 25 MB upload limit by bypassing the serverless
function for the byte transfer. The browser uploads directly to Vercel Blob
storage; the function only issues the presigned URL and records the metadata.

## Architecture

```
Browser                    /api/user-corpus/upload-url        Vercel Blob
   |                              |                               |
   |-- POST {name, size, type} -->|                               |
   |                              |-- createUploadUrl() ---------->|
   |<-- {uploadUrl, pathname} ----|                               |
   |                              |                               |
   |-- PUT bytes (direct) --------------------------------------->|
   |                              |                               |
   |-- POST {pathname, name} ---->|                               |
   |                              |-- createDocument()             |
   |<-- {document} ----------------|                               |
```

## Why this shape

1. **The bytes never touch the function.** Vercel Blob's `createUploadUrl`
   issues a presigned URL; the browser PUTs directly to the store. No 4 MB cap,
   no function memory pressure, no timeout on large files.

2. **The store stays private.** The existing `BLOB_READ_WRITE_TOKEN` (already in
   production env, confirmed 2026-08-30) is the credential for the user-upload
   store. `createUploadUrl` generates a short-lived, single-purpose URL — the
   browser never sees the token. D3's new `ancient-paths-corpus` store is a
   separate CDN concern and is NOT involved here.

3. **Two calls instead of one.** The first call (`/api/user-corpus/upload-url`)
   validates the file metadata (size, type, extension) and returns the presigned
   URL. The second call (`/api/user-corpus/upload-complete`) records the document
   after the bytes land. Both are small JSON — well under the 4 MB cap.

## API changes

### `POST /api/user-corpus/upload-url`

Request:
```json
{ "name": "sermon.pdf", "size": 24_000_000, "type": "application/pdf" }
```

Response:
```json
{ "uploadUrl": "https://blob.vercel-storage.com/...", "pathname": "user-uploads/<userId>/<uuid>.pdf" }
```

Validation (same rules as today, from `sniff.ts` and `clientRefusal`):
- `size <= MAX_UPLOAD_BYTES` (25 MB once this ships)
- Extension in the allowed set (`.pdf`, `.docx`, `.txt`, `.md`)
- Rate-limited per user (`checkCorpusUploadRateLimit`)

### `POST /api/user-corpus/upload-complete`

Request:
```json
{ "pathname": "user-uploads/<userId>/<uuid>.pdf", "name": "sermon.pdf" }
```

Response: the created document (same shape as today's upload route).

This call:
1. Verifies the blob exists at `pathname` (HEAD request to the store).
2. Sniffs the type from the stored bytes (same `sniffType` as today).
3. Creates the document row and kicks the drain (same as today).

## Client changes

`my-works.tsx`'s upload flow becomes:

```typescript
// 1. Get the presigned URL
const { uploadUrl, pathname } = await fetch('/api/user-corpus/upload-url', {
  method: 'POST',
  body: JSON.stringify({ name: file.name, size: file.size, type: file.type }),
}).then(r => r.json());

// 2. Upload directly to Blob
await fetch(uploadUrl, { method: 'PUT', body: file });

// 3. Record the document
await fetch('/api/user-corpus/upload-complete', {
  method: 'POST',
  body: JSON.stringify({ pathname, name: file.name }),
});
```

## What does NOT change

- `MAX_UPLOAD_BYTES` goes back to 25 MB (the platform cap no longer applies).
- `sniffType`, `assertWithinSizeCap`, `checksum` — all still run, but on the
  stored bytes during `upload-complete`, not on the raw request body.
- `createDocument`, `drain`, `requeueForRetry` — unchanged.
- The existing `BLOB_READ_WRITE_TOKEN` — unchanged, still server-side only.

## Security

- The presigned URL is single-purpose and short-lived (Vercel Blob default:
  10 minutes). It cannot be used to read, list, or delete.
- The `upload-complete` call verifies the blob exists before creating the
  document, so a forged `pathname` fails.
- The store stays private. The browser never sees `BLOB_READ_WRITE_TOKEN`.
- Rate limiting applies to `upload-url` (the metering point), not to the direct
  PUT (which is unauthenticated by design — the URL itself is the credential).

## Migration

1. Add `/api/user-corpus/upload-url` and `/api/user-corpus/upload-complete`.
2. Update `my-works.tsx` to use the two-call flow.
3. Restore `MAX_UPLOAD_BYTES` to 25 MB.
4. Deprecate the old `/api/user-corpus/upload` route (keep for backward
   compatibility with in-flight uploads, remove after one deploy cycle).
