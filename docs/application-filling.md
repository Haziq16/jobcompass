# Application filling companion

The owner-only desktop Chrome companion connects a queued job to supported Greenhouse, Lever/EU and Ashby application forms and fills them from your confirmed facts and saved answers, without an AI request. **It never submits the form. You review every field and press the employer's Submit button yourself.** Version **2.2.0** removes the earlier automatic-submission path entirely. It uses Chrome's debugger permission narrowly, to open a focused dropdown on the connected form with the keyboard. See [processing and recovery](application-reliability.md) for permission boundaries, screening and report provenance.

## Connect a job

1. Confirm Contact in Application profile, including given/first and family/last names when required. Name components are never guessed from a full name.
2. Open a queued job's **Fill application** setup. Download the companion archive, extract it, enable Chrome developer mode at `chrome://extensions` and choose **Load unpacked**. Existing users replace the files and reload the extension; the website requires Companion 2.2.0. Its stable ID is `iljjpkhlfijljkfglkpnpmodadeohchi`.
3. Select an owned original PDF or DOCX CV, or a reviewed tailored Word CV saved from preparation, under 2 MiB. Check the hiring country. An unambiguous listing country can initialize this choice; it never supplies work authorization or citizenship.
4. Confirm use of your facts and selected CV, then connect. The short-lived grant is restricted to this job, profile revision and selected CV.
5. Check the actual progress report. Missing or expired questions appear in the private answer inbox. Confirm an answer there and recheck. Revoking a connection blocks further filling.
6. Review the employer form and submit it yourself. Then mark the job Applied in My Jobs; filling never marks a job Applied.

The engine preserves existing values, fills supported native controls and ARIA comboboxes, rescans conditional questions, checks browser-retained values and verifies the original CV upload. Required consent checkboxes, CAPTCHA, login, unsupported widgets and ambiguous forms are left for you. CV bytes and formatting are unchanged; upload checks are not an ATS certification.

## Boundaries

The companion's service worker owns grants in trusted session storage. Employer page scripts do not receive tokens or provider keys. Its narrow API accepts only the exact extension origin and an unexpired, nonrevoked, job-bound grant, and exposes only `scan` and `report` actions. There is no submit or outcome endpoint. Other cross-site requests remain blocked. Employer DOM labels and options are data, never instructions or executable code.

Supported domains are exact HTTPS ATS hosts; arbitrary company sites, nested application frames and mobile extensions are not supported. Platform changes can require maintenance. Current coverage does not imply compatibility with every employer form.

## Verification

`npm test` checks service contracts, workspace boundaries, expiry, revocation and report revisions, and that the companion API refuses `submit` and `outcome` requests. `npm run test:filling` loads the actual unpacked extension into Chrome against a controlled fictional form with employer network submissions blocked and asserts that nothing is submitted.
