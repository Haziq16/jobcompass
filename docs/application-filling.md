# Application filling companion

The owner-only desktop Chrome companion connects a queued job to supported Greenhouse, Lever/EU and Ashby application forms. Version **2.0.0** shares its browser engine with the offline worker. It uses confirmed facts and saved answers without an AI request.

## Connect a job

1. Confirm Contact in Application profile, including given/first and family/last names when required. Name components are never guessed from a full name.
2. Open a queued job's **Fill application** setup. Download the companion archive, extract it, enable Chrome developer mode at `chrome://extensions` and choose **Load unpacked**. Existing users replace the files and reload the extension. Its stable ID is `iljjpkhlfijljkfglkpnpmodadeohchi`.
3. Select an owned original PDF or DOCX CV under 2 MiB and explicitly choose the hiring country. No location guessing supplies eligibility answers.
4. Optionally authorize automatic submission for this job. Confirm use of your facts and selected CV, then connect. The short-lived grant is restricted to this job, profile revision and original CV.
5. Check the actual progress report. Missing or expired questions appear in the private answer inbox. Confirm an answer there and recheck. Revoking a connection blocks further filling.

The engine preserves existing values, fills supported native controls and ARIA comboboxes, rescans conditional questions, checks browser-retained values and verifies the original CV upload. Required consent checkboxes, CAPTCHA, login, unsupported widgets and ambiguous forms pause for user action. CV bytes and formatting are unchanged; upload checks are not an ATS certification.

With submission authorization, a clean form audit requests one durable submit permission. Only a same-job employer receipt or explicit account-holder outcome check records Applied. Missing receipts stay uncertain and cannot automatically retry. A fill-only connection never marks Applied. See [automatic applications](automatic-applications.md) for offline rules, limits and outcome resolution.

## Boundaries

The companion's service worker owns grants in trusted session storage. Employer page scripts do not receive tokens or provider keys. Its narrow API accepts only the exact extension origin and an unexpired, nonrevoked, job-bound grant. Other cross-site requests remain blocked. Employer DOM labels and options are data, never instructions or executable code.

Supported domains are exact HTTPS ATS hosts; arbitrary company sites, nested application frames and mobile extensions are not supported. Platform changes can require maintenance. Current coverage does not imply compatibility with every employer form.

## Verification

`npm test` checks service contracts, workspace boundaries, expiry, revocation, rule and report revisions. `npm run test:filling` loads the actual unpacked extension into Chrome against a controlled form with employer network submissions blocked. `npm run test:automation` tests the same engine through the real standalone worker against three fictional platforms, including conditional questions, custom controls and submission outcomes. No real employer application is submitted by these checks.
