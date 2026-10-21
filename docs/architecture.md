# Architecture

JobCompass is a Next.js application backed by PostgreSQL. Prisma handles database access; Better Auth handles hosted account sessions.

## Main flows

**Discovery:** An explicit user action posts a selected company board and keywords to the authenticated direct-discovery endpoint. A provider adapter validates the public response, normalizes jobs, and stores them in the user's workspace. Durable request records support caching, idempotency and rate limits.

**Browsing:** Jobs, Saved and Applications query stored data. Local filters and navigation do not call job providers. Common list queries paginate in PostgreSQL; deterministic match ranking currently runs in application memory.

**Tracking:** Saved notes, application stages and timeline events are private records. Opening an employer application URL never marks an application submitted. The user records outcomes manually.

## Account isolation

Authenticated request handlers enter a workspace context using the session user's ID. The scoped Prisma client filters private operations and assigns ownership on creation. Workspace IDs are immutable during updates. Composite foreign keys prevent a child record from linking to another account's job, application, run or profile version.

Authentication tables use a separate client. An unscoped private-data request in hosted mode fails closed. Local mode uses a loopback-only development workspace.

## Directory map

| Location | Purpose |
| --- | --- |
| `src/app/(workspace)` | Main product screens |
| `src/app/api` | Validated request handlers and auth routes |
| `src/components/workspace` | Current workspace UI |
| `src/lib` | Providers, discovery, matching, account context and data access |
| `prisma` | Schema and ordered SQL migrations |
| `tests` | Isolated fixtures and database integration tests |
| `scripts` | Local database and verification utilities |
| `extension` | Deferred companion source; inactive in this release |

## Current limits

Discovery searches one selected Greenhouse or Lever board, not a worldwide company catalogue. Missing provider values remain unknown. There is no scheduled crawler, mailbox integration or automated employer submission. AI and companion tools are disabled. See [README.md](../README.md) for configuration and [SECURITY.md](../SECURITY.md) for credential handling.
