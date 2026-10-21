# Optional personal-key AI

The AI studio compares one résumé with one selected catalogue or private job. It combines free deterministic text/keyword checks with an explicit, user-paid structured model request. Model calls use the user's chosen OpenAI, Google Gemini, Anthropic or OpenRouter key. There is no shared key or AI Gateway fallback.

![AI studio with fictional browser-verification data and a simulated provider](images/ai-studio.png)

## Access and removal

Set `AI_MODE` in the **production** Vercel environment and redeploy:

| Value          | Behaviour                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `off` or unset | Hide AI navigation, settings and job links; refuse AI operations server-side; the studio page is unavailable.                  |
| `owner`        | Only the signed-in account matching `OWNER_EMAIL` can use the studio. All other accounts retain normal discovery and tracking. |
| `byok`         | All signed-in accounts can use their own API key. No user can invoke someone else's stored review.                             |

The initial release uses `owner`. Keep `ENABLE_AI=false`: that older flag controls the separate legacy gateway/companion implementation, which stays disabled. The new module does not enable employer form filling or submissions.

Turning the mode off preserves jobs and review history. Users can still export their own stored reviews through workspace export, or remove them with profile clearing. To delete code entirely, the new feature lives in `src/lib/personal-ai*`, `src/lib/resume-*`, `src/lib/ai-access.ts`, `src/app/api/ai`, the assistant page, and its context/UI/CSS. Remove the small navigation/settings/job-link integrations at the same time; keep the database table if historical exports are needed. Reverting the additive migration is not required to disable AI.

## Key handling and data flow

1. A user enters a provider key into the AI studio. It exists only in React state in the current tab. No localStorage, sessionStorage, cookie, database, account setting or export contains the key.
2. Loading model IDs explicitly sends the key to the selected provider's fixed HTTPS models endpoint. It does not request inference. Model availability and structured-output support depend on the provider account.
3. The user selects a real job and reviews pasted, saved or extracted résumé text. PDF/DOCX import is limited to 3 MB and PDFs to 40 pages, using the maintained PDF.js-based `unpdf` extractor without font rendering. Import performs server-side text extraction without an AI request or uploaded-file retention. Image-only PDFs need separate OCR. Literal symbols are preserved in the editable text preview.
4. After the user confirms the text and provider usage, the server sends the résumé blocks and job text to that provider. Keys are request-local. Redirects and arbitrary endpoints are refused. No tools, remote-image fetches, web search, provider failover or automatic retries are enabled. OpenAI Responses requests set `store:false`; the provider's own data and billing policies still apply.
5. The report, source snapshots, provider/model IDs, usage where available, and safe error codes are stored in the user's workspace. Prompt credentials, raw provider errors and transport request bodies are not stored or logged. Users can delete individual completed reviews, clear reviews with their profile or export their own records.

There is no automatic billable connection test. Generating a review is an explicit action, never a side effect of discovery or profile saving. `BYOK_DAILY_LIMIT` defaults to 20 attempts per account per UTC day, including failed or uncertain attempts. A shared per-account lock permits only one pending review. Replays of the same request key cannot dispatch twice. Uncertain requests are not retried; a user must deliberately start a new request, which may incur another charge.

## Accuracy boundaries

- Text diagnostics are heuristics: extractable words, email-shaped text, standard English headings, length and replacement characters. They cannot reliably judge original PDF/DOCX columns, page count, reading order or an employer's parser. The editable text preview is essential.
- Keyword coverage uses explicit word boundaries and a small, documented vocabulary across several fields. Java and JavaScript remain distinct. Presence means a word was mentioned, not proficiency. Missing words do not establish a missing qualification.
- AI requirements must quote the actual job text. Candidate evidence must cite a real numbered résumé block and an exact substring. Invented excerpts, requirements, unsupported evidence IDs and duplicate sections are rejected.
- Obvious keyword mismatches and unconfirmed numeric experience durations cannot remain labelled as explicit support. Other relevance decisions, priorities, inferred transferability and clarification questions remain AI judgments requiring human review.
- The tailored outline selects and reorders original excerpts. It is not a rewritten or complete résumé. Users must preserve context, employers, dates, chronology and relevant omitted material before using it. No skill or achievement is inserted merely because the employer asks for it.
- There is no ATS pass score, hiring probability or interview guarantee.

## Verification

Integration tests exercise all four SDK adapters with simulated provider HTTP responses, grounding failures, key redaction, concurrency, request replays, quotas, actual owner/non-owner sessions, private exports and deletion. Browser acceptance tests preload `scripts/ai-browser-fixture.mjs` only in the isolated fixture database, exercising the real studio → API → SDK → validation → database flow without contacting a live model provider. The fixture module refuses Vercel and non-test databases and is never imported by application code.

A real paid model call still requires a user to enter their own valid key and choose an available structured-output model in the app. Tests do not spend a user's API credits.
