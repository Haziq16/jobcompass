# Application filling preview

Application filling connects one queued job to the desktop Chrome companion. It uses confirmed application-profile facts and explicitly confirmed answer memory, without an AI request. The first adapter covers native controls on Greenhouse-hosted application pages.

## Use it

1. Confirm **Contact** in Application profile, including given/first and family/last names if a form asks for them separately. Name components are never guessed from a full name. Existing profiles may need contact reconfirmation after adding these fields.
2. Save the CV you want to use as an original PDF or DOCX in Application profile. Automatic upload supports files up to 2 MiB; the ordinary CV library still accepts its existing upload limit. If using an AI-tailored version, download and save that reviewed file first.
3. Open a queued job and choose **Fill application**. Select its CV, enter the hiring country, and explicitly consent to use those details for the employer.
4. Download Companion 1.1.0 from the setup page, extract it, and load the folder through `chrome://extensions` with Developer mode enabled. Keep that folder. Reload the extension after replacing its files for an update.
5. Choose **Connect and fill**. The companion opens the employer form and fills supported empty controls. Existing values are preserved. It uploads the selected CV unchanged when the resume control accepts its format.
6. Read the real form report. Answer missing screening questions in the private inbox, return to the employer tab, and choose **Recheck and fill missing fields**. The extension popup also offers a recheck for a connected tab.
7. Check all fields and uploads on the employer form. This preview never clicks Submit, advances an employer application, or records Applied. Login, CAPTCHA, custom controls and employer submission remain yours.

The installer archive is rebuilt from reviewed source by `npm run package:companion` and by `npm run build`. It contains no credentials or user data. The stable public manifest key yields extension ID `iljjpkhlfijljkfglkpnpmodadeohchi`.

## Supported controls and verification

- The first adapter accepts `boards.greenhouse.io/<board>/jobs/<id>` and `job-boards.greenhouse.io/<board>/jobs/<id>` over HTTPS on the default port. Redirects between those hosts for the same board and job are allowed. A different job or destination is refused.
- One recognizable application form is required. Ordinary text/email/phone/URL/number inputs, text areas, native selects, native radio groups and resume file inputs are inspected. Hidden resume upload inputs associated with a visible upload area can be used. Other hidden controls are skipped.
- Known contact labels map to explicitly confirmed facts. Screening questions use the existing conservative answer matcher and job/country/employer context. Select and radio values must match exactly one available option; partial or ambiguous choices remain manual.
- Checkboxes are never automatically checked. Custom comboboxes, nested frames, unknown uploads and ambiguous forms remain manual. This is partial Greenhouse coverage, not a claim that every Greenhouse form or company career site is supported.
- Native setters dispatch input/change events. Filling checks control validity, retained values, selected files, upload format, file size and SHA-256 integrity. A second check catches values cleared or controls changed by the page. These checks do not prove the employer accepted an upload or an application.
- Required unresolved controls and CAPTCHA/login warnings keep the report in `needs_input`. Optional unresolved fields remain listed. A `filled` state means required inspected native controls passed the browser checks, with user-entered values preserved for manual inspection; it does not mean submission or eligibility verification.

## Access and data

`FILL_MODE=owner` is the default, independently of paid AI. `off` disables it. An explicit `all` release also requires matching access for those accounts. The legacy gateway/companion workflow remains disabled.

The website issues a random 30-minute bearer grant for an owned queued job and selected CV. Only its hash is stored in the database. Starting a new connection revokes the previous connection for that job. Profile revision changes, leaving the queue, expiry, revocation, another job or another account prevent reuse.

The extension accepts website connections only from the canonical JobCompass origin or local development origin. It stores scoped connection credentials in Chrome's session storage, restricted to extension contexts, and removes them when the connected tab closes. No provider API key is sent to the extension. Profile/answer data is fetched through the extension background worker, not handed to employer page scripts as a connection token.

The `/api/fill-companion` endpoint permits only the exact extension origin plus a valid job-scoped grant. The narrow proxy exception preserves host/configuration checks. Other cross-site requests stay blocked. Employer DOM content is treated as untrusted labels and options, never instructions or executable code. No AI inference, CAPTCHA bypass or employer submission endpoint is used.

`ApplicationFillSession` stores owned session metadata, scanned labels/options and browser-reported results. Reports do not store existing field values, uploaded bytes or bearer tokens. Account export omits grant hashes; profile clearing deletes sessions and their access. Queue/application history is preserved.

## Verification

`npm test` covers service contracts, workspace boundaries, context, expiry, revocation and browser-report revisions. `npm run test:filling` runs an isolated local database/server and loads the actual unpacked extension into Chrome. A controlled Greenhouse-shaped form verifies exact DOCX upload, text/select/radio fill, preserved values, a page-cleared value, missing-answer inbox/recheck and owner-only access. Employer network submissions are blocked and asserted zero. These fixtures do not establish compatibility with every live employer form.

The wider `npm run test:browser` suite verifies existing accounts, discovery, swipe matching, AI Studio and original-CV workflows separately. Native mobile apps, unattended workers, automatic employer submission and broader ATS adapters remain subsequent work.
