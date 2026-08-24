# PWA / Settings / Robots-Sitemap — code + HTTP checks (localhost:3066, signed out)

## MK-028 — manifest.webmanifest
`curl -b gc.txt http://localhost:3066/manifest.webmanifest` → 200, valid JSON:
```
name: "Ancient Paths"
short_name: "Ancient Paths"
description: present
start_url: "/"
display: "standalone"
background_color: "#f7f3ea"
theme_color: "#221d16"
icons: 3 entries —
  /icons/icon-192.png  192x192
  /icons/icon-512.png  512x512
  /icons/icon-512-maskable.png  512x512 purpose:maskable
```
All required fields present: name, short_name, icons (multiple real sizes, incl. a maskable
variant), theme_color, start_url, display. Nothing missing. PASS.

## Icon bytes (MK-029-adjacent, no device needed)
| icon | http | bytes | file type |
|---|---|---|---|
| icon-192.png | 200 | 3,883 | PNG 192x192 |
| icon-512.png | 200 | 9,993 | PNG 512x512 |
| icon-512-maskable.png | 200 | 8,206 | PNG 512x512 |
All three load, correct declared dimensions, non-trivial size (not 0-byte/1x1 placeholders). PASS.
Actual "add to home screen" behavior (MK-029 itself) still needs a real device — not tested here.

## MK-011/012 — hero images across the four marketing pages
Grepped rendered HTML for `background-image` / `<img src=`:
| page | hero image | http |
|---|---|---|
| `/` | `/marketing/hero-ground.jpg` | 200 |
| `/features` | `/marketing/hero-ground.jpg` | 200 |
| `/why` | `/marketing/hero-ground.jpg` | 200 |
| `/about` | **none found** | n/a |

`/about`'s HTML has no hero `background-image` and no `<img>` tag at all (checked with a broader
`\.(jpg|jpeg|png|webp|svg)` grep too — only hits are `/favicon.svg`, `/icons/apple-touch-icon.png`,
and the OG meta image `og-image.jpg`, none of which is a page hero). This isn't a broken image
(no 404) — it's an **absent** one. MK-011/012 assume every marketing page has a hero; `/about`
doesn't, which is either a finding (inconsistent page template) or expected (worth a human glance
at `/about` in a browser to confirm it isn't supposed to have one — that visual check is out of
scope for this HTTP-only pass).

`hero-ground.jpg` itself: `curl -I` → 200 OK, served with the CSP/security headers, no 404 anywhere.

## ST-001 — settings enumeration (source: `web/src/app/settings/settings-form.tsx`)
Six `<section>` blocks, each with a `<p className={label}>` heading:
1. **Reading theme** — Light/Dark toggle buttons
2. **Text size** — A−/A+ stepper (`SIZE_LABELS`, 5 steps)
3. **Column width** — narrower/wider stepper (`MEASURE_LABELS`, 5 steps)
4. **Default translation** — button group over `TRANSLATIONS`
5. **Account** — link to `/account/settings` ("Email and password →")
6. **Your saved work** — link to `/library/notes` ("Your highlights, notes and bookmarks →")

Cross-check against the prior agent's browser-observed list (Reading Theme, Text Size, Column
Width, Default Translation, Account link):

- **"Your saved work" exists in source but is NOT in the browser-observed list.** Flag: needs
  browser verification — either it renders and was missed, or something is suppressing it.
- The other five match 1:1 (Account = the "Account" section's link).
- No settings in source beyond these six — enumeration is exhaustive per the file (183 lines,
  no other `<section>`/`<h*>`/`<label>` groups).

Code comment in the file itself documents that `/account/settings` exists and renders a real
change-password form but has zero inbound `href` elsewhere in the app except this settings page —
worth noting as adjacent context, not a new finding.

## Robots / sitemap
`curl http://localhost:3066/robots.txt` → 200, non-empty:
```
User-Agent: *
Allow: /
Allow: /about
Allow: /features
Allow: /why
Disallow: /
Sitemap: https://ancientpaths.app/sitemap.xml
```
Note: `Allow: /` appears before `Disallow: /` for the same UA — order is same-specificity-tie,
most parsers (Google) resolve ties toward Allow, but this is worth a second look since the intent
(allow marketing pages only) is currently expressed ambiguously rather than via more specific
Disallow rules per subpath. Not verified against an actual crawler.

`curl http://localhost:3066/sitemap.xml` → 200, valid XML, lists exactly 4 URLs:
`/`, `/about`, `/features`, `/why` — all public marketing routes, nothing gated/private. PASS.
