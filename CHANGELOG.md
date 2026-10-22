# Changelog

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
