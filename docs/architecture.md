# Architecture

JobCompass is a Next.js application backed by PostgreSQL. Prisma handles database access; Better Auth handles hosted account sessions.

## Main flows

**Discovery:** Public employer feeds populate shared `CatalogBoard` and `CatalogJob` tables. A single `CatalogSync` lease coalesces scheduled and browsing-triggered refreshes. Validated complete snapshots commit per board; conditional requests and content hashes avoid unnecessary writes. Search uses a PostgreSQL full-text index and database pagination. Saving an opportunity creates an independent private job/source/save, preserving account boundaries.

**Manual import:** An explicit user action can still post another Greenhouse or Lever board and keywords to the authenticated direct-discovery endpoint. This separate path stores matching jobs directly in the user's workspace. Durable request records support caching, idempotency and rate limits.

**Browsing:** Jobs, Saved and Applications query stored data. Local filters and navigation do not call job providers. Common list queries paginate in PostgreSQL; deterministic match ranking currently runs in application memory.

**Tracking:** Saved notes, application stages and timeline events are private records. Opening an employer application URL never marks an application submitted. A job becomes Applied only when the user explicitly confirms it. JobCompass never submits applications.

**Optional AI:** `AI_MODE` controls an independent personal-key studio. A server-side policy gates both the UI and API. Provider adapters receive request-local keys and fixed endpoints, never owner credentials. Structured responses are checked against the source résumé/job before workspace-scoped `AiReview` snapshots and reports are stored. Text/keyword checks are separate heuristics. See [personal AI](personal-ai.md).

## Account isolation

Authenticated request handlers enter a workspace context using the session user's ID. The scoped Prisma client filters private operations and assigns ownership on creation. Workspace IDs are immutable during updates. Composite foreign keys prevent a child record from linking to another account's job, application, run or profile version.

Authentication tables and the public catalogue use an explicitly unscoped client. Catalogue queries do not contain personal notes, applications or saved state. Personal status is joined through the account-scoped client only. An unscoped private-data request in hosted mode fails closed. Local mode uses a loopback-only development workspace.

## Directory map

| Location                   | Purpose                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `src/app/(workspace)`      | Main product screens                                            |
| `src/app/api`              | Validated request handlers and auth routes                      |
| `src/components/workspace` | Current workspace UI                                            |
| `src/lib`                  | Providers, discovery, matching, account context and data access |
| `prisma`                   | Schema and ordered SQL migrations                               |
| `tests`                    | Isolated fixtures and database integration tests                |
| `scripts`                  | Local database and verification utilities                       |
| `extension`                | Owner-only companion and shared form engine                     |

## Current limits

The curated catalogue is weighted toward technology employers, with worldwide roles across departments. It is not the entire worldwide job market. Refreshes are polling, not real-time employer webhooks; source delays and GitHub schedule delays affect discovery latency. Missing provider values remain unknown. Personal-key AI is optional. See [discovery operations](discovery.md), [README.md](../README.md) and [SECURITY.md](../SECURITY.md).

## Application filling

The owner-only Chrome companion fills supported Greenhouse, Lever/EU and Ashby forms from confirmed profile facts and saved answers, using a short-lived, job-bound grant. It never submits: the user reviews the form and presses Submit, then marks the job Applied. There is no background worker or automatic submission. See [application filling](application-filling.md).
