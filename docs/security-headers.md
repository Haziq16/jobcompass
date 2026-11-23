# Security headers

`src/proxy.ts` sets these on every application response (static assets excluded):

| Header | Value | Mode |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | enforced |
| `Referrer-Policy` | `no-referrer` | enforced |
| `X-Frame-Options` | `DENY` | enforced |
| `Cache-Control` | `no-store` | enforced |
| `Strict-Transport-Security` | set by the hosting platform | enforced |
| `Content-Security-Policy-Report-Only` | see below | report only |
| `Permissions-Policy-Report-Only` | camera, microphone, geolocation, payment, USB, serial, HID, Bluetooth, display capture and clipboard read off; clipboard write for this origin only | report only |

## Content Security Policy

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data: blob:; connect-src 'self'; frame-src 'self';
worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none'
```

Why each allowance exists:

- `'unsafe-inline'` scripts: Next.js inline bootstrap scripts (no nonce is used yet). Development builds also add `'unsafe-eval'`.
- `'unsafe-inline'` styles, `data:`/`blob:` images and fonts: React style attributes and the sandboxed DOCX preview, whose `srcdoc` frame inherits this policy and contains inline styles and embedded images.
- `connect-src 'self'`: the browser only calls JobCompass APIs. AI provider requests are made by the server.
- The Chrome companion talks to the page through `chrome.runtime` messaging, which CSP does not govern.

### Known report

Zod 4 normally probes `new Function` to build faster parsers. JobCompass imports `z` only from `src/lib/zod.ts`, which sets `jitless: true`, and ESLint rejects direct `zod` imports in `src/`.

One third-party report remains: loading the Word preview pulls in `docx-preview` → `jszip` → the bundler's browser shims for Node's `stream`/`util`. One of them (`is-generator-function`) runs `Function("return function*() {}")` once when that code loads. The browser tests allow exactly this report (string evaluation from the chunk containing the DOCX preview and that shim) and fail on any other.

The policy is **report-only**: browsers log violations to the console and block nothing. `npm run test:browser` and `npm run test:workspace` fail on any CSP or Permissions-Policy console message other than the known report above, so a regression shows up in testing. No external report endpoint is configured.

## Before enforcing

1. Replace `'unsafe-inline'` in `script-src` with a per-request nonce generated in `src/proxy.ts` plus `'strict-dynamic'` (see the Next.js guide in `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`). Nonces require dynamic rendering for pages that currently prerender.
2. Remove the `docx-preview`/`jszip` string evaluation: load the preview without the Node `stream` shim (for example a browser-only JSZip build or an alias that drops `readable-stream`), or keep `'unsafe-eval'` for that bundle only by isolating the preview on a separate origin.
3. Keep `'unsafe-inline'` for styles unless the DOCX preview moves to hashed or nonce-tagged styles.
4. Run the browser suites with the enforcing header and watch production console reports for at least a week.
5. Rename the header to `Content-Security-Policy`. `frame-ancestors 'none'` then supersedes `X-Frame-Options`.
6. `Permissions-Policy-Report-Only` has limited browser support; switch to `Permissions-Policy` once the feature list is confirmed.
