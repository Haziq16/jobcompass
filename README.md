# JobCompass

**A clearer place for your job search.**

Discover jobs from company boards, build a shortlist, and keep applications moving in a personal workspace.

[Features](#features) · [Local setup](#local-setup) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

![JobCompass discovery workspace with fictional demonstration data](docs/images/discovery.png)

## Features

- **Worldwide discovery:** search independently collected employer feeds from Greenhouse, Lever (including EU), Ashby, Workable and Recruitee, with database pagination and company, location, remote and freshness filters.
- **Automatic feed checks:** scheduled background refreshes and coalesced checks while browsing, without a paid job-search API key.
- **Direct discovery:** optionally import another Greenhouse or Lever company board into your own workspace.
- **Your job library:** search stored opportunities, filter metadata, browse details, and skip or restore roles.
- **A focused shortlist:** save jobs and keep private notes and tags.
- **Application tracking:** maintain stages, notes, dates and an event timeline. Employer links never automatically mark a role Applied.
- **Personal matching:** a **For you** feed ranks the whole catalogue using saved CV skill mentions, target roles, declared experience, locations and work preferences, with visible reasons for each match.
- **Separate accounts:** hosted signup and sign-in with account-scoped data, exports and deletion controls.
- **Responsive interface:** consistent typography, desktop and mobile navigation, keyboard-accessible job details, and light/dark themes.

**Optional AI studio:** résumé text checks, job-keyword coverage, evidence-linked AI reviews and full tailored CV drafts using the user's own provider key. Compare rewritten wording with original sources, edit private versions, and download a reviewed Word or text CV. The initial release is an owner-only preview; `AI_MODE=off` removes the feature, and `AI_MODE=byok` enables it for signed-in users with their own keys. See [personal-key AI](docs/personal-ai.md) and [research notes](docs/ai-research.md).

The legacy gateway tools remain disabled. The owner-only **Fill application** preview connects queued Greenhouse, Lever and Ashby jobs to a desktop Chrome companion, uses confirmed profile/answer memory, uploads the selected original CV unchanged, and reports missing or rejected values. Install it once from the queue setup screen. Submission is separately authorized and receipt checked. Offline processing is available through explicit owner rules; it starts paused. See [automatic applications](docs/automatic-applications.md). See [application filling](docs/application-filling.md). Public accounts do not use the shared paid JSearch connection.

## How discovery works

The owner-only **Swipe** preview adds a personalised card deck, three-step preference setup, explicit match reasons, pass feedback, undo and a persistent application queue. Right swipe queues a listing. When the owner enables automatic rules, supported cards name the recipient and CV. A right swipe authorises that specific application for offline processing. Old queued jobs are not silently released. Queue priorities, saved-for-later and passed collections remain private to the account. Other accounts retain List discovery. `MATCH_MODE=owner` is the default; `off` disables matching and `all` explicitly opens it to signed-in accounts. See [swipe matching](docs/swipe-matching.md) for filters and unknown-data handling.

The owner preview also includes a verified application profile, conservative CV extraction, a contextual answer library and an inbox for missing or stale questions. Original CV files stay unchanged; only explicitly confirmed facts supply answers. See [application memory](docs/application-memory.md) for expiry and account controls.

Discover searches a shared index of public employer listings. Search by title, skill or company, add a location, then filter by employer, remote work, source or freshness. Results are paginated in the database; saving creates an independent copy in your private workspace. Jobs are never copied into every account automatically.

Switch between **For you** and all opportunities. Recommendations use only your account's saved CV and profile; mentions do not establish proficiency. Search expands common role variants such as developer/engineer and ranks title matches above incidental description mentions. Explicit freshness sorts remain available. AI Studio also offers recommended jobs and an original-DOCX workflow with document preview, paragraph comparisons and structural ATS readiness findings. These free checks and recommendations do not call a model.

Common skill and exclusion mentions are computed once per public listing, tied to its content hash and matcher version. Personalized ranking reads those small keys instead of scanning every full description for every skill. Uncached custom terms and stale cache rows retain exact text checks. Public keyword filtering still searches indexed descriptions; relevance ranks short title/company fields, with description-only matches ordered by date. Recommendations continue to rank the full filtered catalogue before pagination.

After a matcher-version change, an operator can run `node --env-file=.env --import=tsx scripts/backfill-catalog-skills.ts --execute` against the intended environment. The resumable 500-row batches update derived public keys only, condition each write on an unchanged content hash, preserve posting/discovery/content-change timestamps and recycle dead tuple space. A separate storage reserve bounds this maintenance. No CVs, private profiles or provider keys are read by the worker.

The included GitHub workflow checks due feeds about every 30 minutes. Signed-in browsing can trigger checks as often as every five minutes. These are polling targets, not instant-delivery guarantees; GitHub can delay schedules and sources may update late. Check **Actions → Refresh job catalogue** for scheduler health. The workflow uses hosted-runner minutes; monitor the repository owner's included allowance and spending settings. There is no new paid scheduler subscription.

Employer publication dates and first-discovery dates are distinct. Greenhouse's `updated_at` is not a posting date. Initial imports are not labelled as new postings. The “newly discovered” filter includes only jobs first detected after a board's initial successful import. The default sort uses publication dates where supplied, or first-discovery time for subsequent arrivals. Remote does not imply worldwide work eligibility.

Complete successful snapshots retire missing roles from discovery. Failed or incomplete snapshots do not close jobs. Feeds unconfirmed for 48 hours leave the search results until they recover. Previously saved private copies and notes remain available. Requests use conditional HTTP validators when supplied, fixed upstream hosts, bounded responses, a global database lease, and failure backoff. Unchanged job content is not rewritten.

The original 64 boards are supplemented by a registry of 19,822 candidate employer boards. Candidates remain invisible until a complete live employer snapshot validates and passes storage admission. Candidate count is not an active-employer or job count. The registry is weighted toward technology employers and is not the entire worldwide job market. Full-text search covers titles, employers, locations, departments and the first 6,000 characters of descriptions. The employer link always provides the complete posting.

The existing scheduler also attempts bounded candidate admission, at most once every six hours. Normal refreshes process at most 120 due boards per invocation. Original priority boards retain a five-minute due interval, added boards use 30 minutes and empty boards use a day; actual detection also depends on backlog and scheduler/source availability. A separate expansion lease prevents duplicate admission runs. No paid data API is used. [Candidate provenance and licence](docs/catalog-candidates.md) are recorded separately.

New-board ingestion pauses at the database-size budget (`CATALOG_DATABASE_BUDGET_MB`, at most 750 MiB), with a conservative per-board reserve. Existing feeds continue refreshing. This is a growth guard, not a guarantee about hosting quotas or private-data growth; watch provider usage and runner minutes. No service plan is upgraded automatically. Free storage cannot be claimed to hold millions of indexed full-description jobs without measurement.

An operator can bootstrap a bounded batch against the intended environment with `node --env-file=.env --import=tsx scripts/expand-catalog.ts --boards 100 --execute`. The scheduler's six-hour interval remains in force; the explicit operator command bypasses that interval but still respects the lease and storage guard. Failed candidates back off without retiring existing jobs. This command writes only shared employer catalogue data and candidate health, never private CVs, credentials or applications.

For a company outside the catalogue, expand **Import another board**, choose a platform and company board token, add keywords, then select **Find jobs**.

For example, a careers URL ending in `job-boards.greenhouse.io/company` or `jobs.lever.co/company` uses `company` as its board token. Lever also supports an EU hosting region.

The optional manual import searches **one selected company board**. It uses caching and stable source identities. Repeated imports update existing records; missing results never automatically delete or close a saved job. Country, salary, posting date and other absent fields remain unknown.

Current bounds: 8 MB per board response, 500 matching jobs per import, 10 seconds between direct attempts and 50 attempts per rolling 24 hours per workspace. Upstream failures are not automatically retried.

## Stack

| Layer        | Technology                                            |
| ------------ | ----------------------------------------------------- |
| Application  | Next.js, React, TypeScript                            |
| Data         | PostgreSQL, Prisma                                    |
| Accounts     | Better Auth, database sessions                        |
| Styling      | CSS, Tailwind, Lucide icons                           |
| Verification | Node.js tests, PostgreSQL fixtures, Playwright/Chrome |

Dependency versions are pinned in `package.json` and `package-lock.json`.

## Local setup

### Requirements

- Node.js 24 and npm.
- A local PostgreSQL instance, or the bundled development database helper below.
- Chrome only if you want to run browser acceptance checks.

### Install

```sh
npm ci
cp .env.example .env
npm run db:generate
```

The template uses loopback-only development settings. It contains no live API credentials. In PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

### Start the database

Run the bundled local PostgreSQL helper in one terminal and leave it open:

```sh
npm run db:start
```

Alternatively, run `docker compose up -d db`, or configure `DATABASE_URL` for your own local PostgreSQL server. The provided local configuration uses port `54329`.

### Start the application

In a second terminal:

```sh
npm run db:migrate
npm run dev
```

Open **http://127.0.0.1:3000/discover**. Local mode is loopback-only and uses a single development workspace. Hosted accounts require the configuration below.

## Hosted accounts

Set these values in the hosting environment, keeping credentials server-side:

| Variable             | Purpose                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Production PostgreSQL connection secret                                         |
| `APP_ACCESS=hosted`  | Require application sessions                                                    |
| `APP_URL`            | Exact public HTTPS application origin                                           |
| `BETTER_AUTH_SECRET` | Strong authentication signing secret, at least 32 characters                    |
| `PUBLIC_SIGNUP=true` | Allow account creation                                                          |
| `ENABLE_AI=false`    | Keep deferred tools disabled                                                    |
| `OWNER_EMAIL`        | Legacy workspace attribution when migrating an existing owner-only installation |

Keep the signing secret stable between releases. Review and apply migrations before promoting a new build. Configure production-domain access separately from repository visibility; a private GitHub repository does not make the hosted website private.

Email verification and email-based password recovery are not configured. Users can change their password while signed in. Do not enable local mode on a hosted server or describe unverified accounts as email-verified.

## Verification

```sh
npm run lint
npm test
npm run test:migration
npm run build
npm run typecheck
```

Tests use isolated local databases and fixture providers. The migration check creates and removes its own temporary database. Do not point these commands at production.

For browser checks, build first, free port `3000`, then run:

```sh
npm run test:browser
```

The browser suite uses two fictional accounts and a dedicated test database. It mocks the direct-import response and checks real account sessions, stored workflows and mobile layout. Configure `CHROME_EXECUTABLE_PATH` if Chrome is installed outside the default Windows location.

The current release passed **139 fixture/database tests**, **45 browser acceptance checks**, **5 real-extension flow checks** and **11 offline-worker/browser checks** locally. CI verifies each new push and pull request; its results are separate from those recorded local checks.

## Project layout

```text
src/app/                  Routes and request handlers
src/components/workspace/ Current product interface
src/lib/                  Discovery, matching, account isolation and data access
prisma/                   Schema and ordered migrations
tests/                    Contract fixtures and database integration tests
scripts/                  Local development and verification helpers
docs/                     Architecture and demonstration screenshots
extension/                Owner-only companion and shared browser form engine
```

See [architecture](docs/architecture.md) for the data flows and account boundaries, [security](SECURITY.md) for credential handling, and [changelog](CHANGELOG.md) for the release history.

## Repository access

This repository is private and intended for explicitly invited collaborators. Environment files, production administration notes, databases, credentials, browser sessions and test output are excluded from Git. The checked-in `.env.example` contains placeholders and development-only defaults.

Access can be managed by the owner under **Settings → Collaborators**. No public redistribution license is granted by repository access.
