# Changelog

## 2026-11-03 - Traceable CV parsing and verified exports

- Add source-linked PDF/DOCX parser previews, layout risks and located fixes in CV preparation and AI Studio.
- Separate required/preferred job requirements, experience evidence, bare mentions and facts needing confirmation. Flag added technical skills and metrics against original CV evidence.
- Read actual tailored Word exports back and block download/library use when readable body text differs from the saved revision.
- Publish a reproducible 20-file synthetic benchmark: 72/80 exact expected fields, no extra field predictions, and 29/29 diagnostic/export/requirement scenarios. Keep known extraction gaps visible in the signed-in methodology page.
- Run diagnostics without model calls or paid parsing services. File checks do not simulate every employer ATS or predict hiring outcomes.

## 2026-10-24 - Swipe discovery redesign

- Bring the employer, role and workplace/contract/salary facts into a focused decision card, with grounded match evidence and eligibility alongside it.
- Keep labelled decision controls reachable while reading; use a compact search disclosure and a separate context column for pass feedback.
- Improve desktop, tablet, phone and dark layouts while retaining gestures, undo, failed-save recovery and explicit application authorization.
- Prevent keyboard arrows on search disclosures from triggering a job decision.

## 2026-10-24 - Unified job search and application preparation

- Add My Jobs with real matching, queue, saved, skipped, applied, interview, offer and attention stages, scoped counts and catalogue pagination.
- Add guided CV selection, confirmed keyword evidence, original-format Word tailoring, editable cover letters and explicitly reviewed screening-answer memory.
- Reuse saved personal AI connections, shared daily allowances, evidence validation and recorded no-retry outcomes. Opening preparation never starts a provider request.
- Bind per-job application approval to the selected reviewed CV and fill-only/submission choice without changing global defaults.
- Release Companion 2.1.1 with verified retained-upload and multi-select fixes. Infer hiring country only from unambiguous listing data; never infer citizenship.
- Keep employer authorization, receipt verification, account isolation and uncertain-submission restart protection.

## 2026-10-23 - Application screening, native controls and useful recovery

- Separate requirement conflicts, unknown eligibility, supported forms and authorized processing before automatic CV access.
- Add explicit answer-reuse scopes, country-specific freshness, corrected US punctuation and job-filtered answer inboxes with confirmed source drafts.
- Release Companion 2.1.0 with a scoped native-dropdown bridge, accurate rescan provenance, clean field labels and corrected invisible-CAPTCHA badge detection.
- Show live processing state in the queue, worker heartbeat and quota use; prioritize tasks needing attention and provide exact blockers with recovery actions.
- Keep confirmed/uncertain outcomes out of restart flows and process applications before catalogue refresh in the existing scheduler.
- Verify 150 integration tests plus expanded browser coverage; no real employer submission is performed by fixtures.

## 2026-10-23 - Fairer automatic-processing allowances

- Release a reserved daily/monthly slot when preparation fails before the worker receives a filling grant.
- Retain preparation failures in the attempt audit and recovery bounds; actual browser attempts and uncertain submissions still consume allowance.
- Verify that a blocked first job cannot prevent a valid second job from starting under a one-attempt allowance.

## 2026-10-23 - Automatic processing from authorised right swipes

- Added visible employer/CV/data disclosure before a supported job card and a clear Authorise & apply action.
- Bound each right-swipe permission to the exact recipient, CV hash, profile and processing rules using an expiring signed disclosure.
- Blocked unapproved old jobs, altered disclosures, stale facts and revoked approvals before the worker can receive CV data or request submission.
- Kept missing-answer, CAPTCHA, limits and uncertain-submission safeguards in place.

## 2026-10-23 - Companion 2.0.1 form compatibility fixes

- Read Lever question labels separately from location-helper text and radio option labels.
- Bound browser report reasons to the API contract so long employer text cannot discard the fill report.
- Correctly distinguish visible controls from zero-size or CSS-hidden placeholders, preserving CAPTCHA checks for presented challenges.
- Recognize the optional LinkedIn autofill widget while still stopping for unknown embedded application controls.
- Added controlled regressions for the observed form structure, long labels, hidden placeholders, the optional widget and unknown application frames.

## 2026-10-23 - Automatic applications and offline processing

- Added owner-only, default-paused automatic application rules, daily/monthly limits, a pause switch, task history and in-app notifications.
- Extended the shared browser engine to Greenhouse, Lever/EU and Ashby, with supported comboboxes, conditional-field rescans and original-CV upload verification.
- Added one-click authorization, a durable duplicate ledger, employer-receipt verification and explicit resolution for uncertain outcomes.
- Reused the existing GitHub scheduler for leased offline browser work; no paid service or AI call is required.
- Upgraded the Chrome companion to 2.0.0. Public account automatic applying remains disabled.

## 2026-10-23 - Application filling preview

- Connected queued jobs to a desktop Chrome companion with short-lived, job-scoped access and original-CV selection.
- Added Greenhouse native-control scanning, confirmed profile/memory filling, exact CV upload, post-fill checks and a real progress report. Missing answers return to the private inbox for recheck.
- Added explicit given/family-name confirmation, owner/off controls, account export/clearing and a reproducible installer archive. Automatic submission remains deferred.

## 2026-10-23 - Application profile and answer memory

- Added owner-preview application onboarding with private CV suggestions, seven fact sections and explicit confirmation. Original CV files remain unchanged.
- Added contextual answer memory, explicitly approved equivalent questions and a missing-answer inbox, with country/employer/job boundaries, expiry and profile-change review.
- Connected queue jobs to application answers; added scoped exports and profile clearing. Automatic filling/submission remains deferred.

## 2026-10-23 — Swipe matching preview

- Added owner-only swipe discovery, verified-preference setup, match explanations and visible unknowns.
- Added account-private queue/saved/passed collections, priorities, durable undo and replay protection.
- Preserved List discovery for other accounts and added configurable matching access.
- Connected explicit application tracking and manual submission confirmation without enabling automatic applications.
- Included matching data in exports and cleared matching facts with profile deletion.
- Verified 91 integration tests, 40 browser checks, migration preservation and rendered light/dark layouts.

## 2026-10-22 — Catalogue expansion

- Added Workable, Recruitee and Lever EU employer-board adapters.
- Imported an attributed MIT-licensed candidate board registry; enable sources only after successful validation and storage admission.
- Added bounded source expansion, leases, backoff and free-database capacity guards to the existing scheduler.
- Cached exact skill mentions with content-hash provenance to reduce repeated description scanning in profile recommendations.
- Preserved private account boundaries, indexed keyword filtering and original listing dates.
- Verified 78 automated tests and 36 browser acceptance checks without paid provider calls.

## 1.2.0 — 2026-10-21

- Added an optional personal-key AI studio with off, owner-only and signed-in BYOK access modes.
- Added OpenAI, Google Gemini, Anthropic and OpenRouter adapters with explicit model selection and no shared-key fallback.
- Added PDF/DOCX text preview, transparent text/keyword checks and evidence-linked job requirement reviews.
- Added extractive tailored résumé outlines, private review history, deletion and export support.
- Kept keys in tab memory and request-local server state; added replay protection, attempt limits and no automatic retries.
- Added source-quote validation and conservative checks for keyword and numeric-experience contradictions.
- Documented GitHub research, accuracy limits, deployment controls and provider data flow.
- Added simulated provider transport tests and owner/non-owner browser coverage without spending live API credits.

## 1.1.0 — 2026-10-21

- Added a shared worldwide catalogue across 64 verified Greenhouse, Lever and Ashby company boards.
- Added indexed keyword search, location/company/remote filters, pagination and accessible job details.
- Added private, idempotent saving from discovery without copying the catalogue into every account.
- Added scheduled feed checks, browsing-triggered refreshes, shared leases, conditional requests and source backoff.
- Distinguished true publication timestamps, initial imports and subsequently discovered jobs.
- Added complete-snapshot closure handling while preserving saved jobs and excluding stale sources.
- Verified thousands of fixture jobs, account isolation, scheduler protection, migrations and desktop/mobile flows.

## 1.0.0 — 2026-10-21

- Added public account registration with private, isolated workspaces.
- Reorganized Discovery, My jobs, Saved, Applications, Profile and Settings.
- Updated typography, spacing and responsive navigation.
- Added direct Greenhouse and Lever job-board imports without API keys.
- Added stored filters, shortlisting, skip/restore and application notes/history.
- Preserved original records through the account-workspace migration.
- Deferred AI and companion features; disabled shared paid discovery for public accounts.
- Added account-isolation, migration-preservation and browser acceptance coverage.

The repository includes earlier supporting modules for future work. Their presence does not mean a deferred feature is enabled in the current product.
