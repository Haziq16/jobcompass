# Automatic applications

This owner-only website feature processes deliberately queued jobs on supported Greenhouse, Lever (including EU) and Ashby hosted forms. It is paused by default. Other users keep ordinary discovery and tracking.

## Setup

1. Confirm Contact, work eligibility and other reusable answers in Application profile. Pick an original PDF or DOCX CV under 2 MiB. Separate names are explicit; no name splitting or invented qualifications.
2. Open **Automatic applications**. Select the CV, fallback hiring country, supported platforms and UTC limits. Default limits are 3 tasks daily and 30 monthly; maximums are 20 and 60.
3. Choose automatic submission or fill-only processing. Explicitly authorize the rules and enable processing. New right swipes enter the offline queue; optionally enroll up to 200 already queued jobs.
4. Results and missing-input notifications remain in this page while away. Email notifications are not configured. Pause cancels waiting/pre-submission leases. A submission already dispatched may finish and must be checked.

The existing GitHub catalogue workflow checks approximately every 30 minutes and starts one browser worker only when enabled work is pending. Schedules can be delayed. Private-repository runner minutes consume the account's existing included allowance; free infrastructure is bounded, not unlimited capacity.

## Submission and recovery

The shared browser engine recognizes native controls, supported ARIA comboboxes, and up to four conditional-field scan cycles. It preserves existing values, verifies uploaded original CV bytes and browser-retained answers, and requires a clean audit before requesting a single submit permission. Unsupported controls, required consent, login and CAPTCHA pause for the user. CAPTCHA is never bypassed.

A workspace/job-identity ledger serializes submit authorization across the companion and worker. Browser clicks, HTTP success codes and generic page text do not confirm Applied. A known confirmation container and receipt message for the same job must be observed after submission. An explicit owner outcome check can resolve an uncertain attempt.

An interrupted pre-submission lease can recover, with bounded claims and counted limits. Once submission is reserved, missing receipts become uncertain and cannot automatically retry. Resolving “no submission” permits an explicit retry; a confirmed application blocks another automatic submission. This guards JobCompass attempts, not applications independently made outside the product. Platform DOM changes may need adapter maintenance; interview outcomes are not guaranteed.

## Operator configuration

- `AUTOMATION_MODE=owner` (default) or `off`; never grants public automatic-apply access.
- Strong `AUTOMATION_WORKER_SECRET` in production and the identically named GitHub Actions secret.
- GitHub repository variable `AUTOMATION_APP_URL` points to the canonical production HTTPS origin.
- Existing `.github/workflows/catalog.yml` supplies the schedule. No new paid service is provisioned.
- Worker endpoints use a timing-safe service credential, expiring task lease, short-lived job grant and current owner policy. Tokens are not returned in account exports or inserted in employer DOM.
- `scripts/automation-worker.mjs` runs the engine in a Chrome isolated world; provider keys are unnecessary. No paid AI call is made by filling or submitting.

Profile clearing removes automation settings, tasks and notifications and revokes fill sessions. Existing applications and the submission duplicate ledger remain as application history. Account exports include scoped history, excluding lease credentials and grant hashes.

## Verification

`npm test` checks permissions, rule revisions, owner/workspace boundaries, concurrency, limits, duplicate guards, receipt validation and recovery. `npm run test:automation` runs the real standalone worker against intercepted fictional Greenhouse, Lever and Ashby forms in an isolated local database. Tests cover conditional fields, comboboxes, exact uploads, confirmed and uncertain receipts, CAPTCHA, no replay and responsive UI. No real employer applications are submitted by these checks. Fixture coverage does not establish universal live-form compatibility.
