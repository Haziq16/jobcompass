# JobCompass

**A clearer place for your job search.**

Discover jobs from company boards, build a shortlist, and keep applications moving in a personal workspace.

[Features](#features) · [Local setup](#local-setup) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

![JobCompass discovery workspace with fictional demonstration data](docs/images/discovery.png)

## Features

- **Worldwide discovery:** search a shared catalogue from 64 public Greenhouse, Lever and Ashby company boards, with database pagination and company, location, remote and freshness filters.
- **Automatic feed checks:** scheduled background refreshes and coalesced checks while browsing, without a paid job-search API key.
- **Direct discovery:** optionally import another Greenhouse or Lever company board into your own workspace.
- **Your job library:** search stored opportunities, filter metadata, browse details, and skip or restore roles.
- **A focused shortlist:** save jobs and keep private notes and tags.
- **Application tracking:** maintain stages, notes, dates and an event timeline. Employer links never automatically mark a role Applied.
- **Personal matching:** a **For you** feed ranks the whole catalogue using saved CV skill mentions, target roles, declared experience, locations and work preferences, with visible reasons for each match.
- **Separate accounts:** hosted signup and sign-in with account-scoped data, exports and deletion controls.
- **Responsive interface:** consistent typography, desktop and mobile navigation, keyboard-accessible job details, and light/dark themes.

**Optional AI studio:** résumé text checks, job-keyword coverage, evidence-linked AI reviews and full tailored CV drafts using the user's own provider key. Compare rewritten wording with original sources, edit private versions, and download a reviewed Word or text CV. The initial release is an owner-only preview; `AI_MODE=off` removes the feature, and `AI_MODE=byok` enables it for signed-in users with their own keys. See [personal-key AI](docs/personal-ai.md) and [research notes](docs/ai-research.md).

The legacy gateway tools and assisted form filling remain disabled. Public accounts do not use the shared paid JSearch connection.

## How discovery works

Discover searches a shared index of public employer listings. Search by title, skill or company, add a location, then filter by employer, remote work, source or freshness. Results are paginated in the database; saving creates an independent copy in your private workspace. Jobs are never copied into every account automatically.

Switch between **For you** and all opportunities. Recommendations use only your account's saved CV and profile; mentions do not establish proficiency. Search expands common role variants such as developer/engineer and ranks title matches above incidental description mentions. Explicit freshness sorts remain available. AI Studio also offers recommended jobs and an original-DOCX workflow with document preview, paragraph comparisons and structural ATS readiness findings. These free checks and recommendations do not call a model.

The included GitHub workflow checks due feeds about every 30 minutes. Signed-in browsing can trigger checks as often as every five minutes. These are polling targets, not instant-delivery guarantees; GitHub can delay schedules and sources may update late. Check **Actions → Refresh job catalogue** for scheduler health. The workflow uses hosted-runner minutes; monitor the repository owner's included allowance and spending settings. There is no new paid scheduler subscription.

Employer publication dates and first-discovery dates are distinct. Greenhouse's `updated_at` is not a posting date. Initial imports are not labelled as new postings. The “newly discovered” filter includes only jobs first detected after a board's initial successful import. The default sort uses publication dates where supplied, or first-discovery time for subsequent arrivals. Remote does not imply worldwide work eligibility.

Complete successful snapshots retire missing roles from discovery. Failed or incomplete snapshots do not close jobs. Feeds unconfirmed for 48 hours leave the search results until they recover. Previously saved private copies and notes remain available. Requests use conditional HTTP validators when supplied, fixed upstream hosts, bounded responses, a global database lease, and failure backoff. Unchanged job content is not rewritten.

The starting board registry is curated and weighted toward technology employers, with roles across departments and regions. It is not the entire worldwide job market. Full-text search covers titles, employers, locations, departments and the first 6,000 characters of descriptions. The employer link always provides the complete posting.

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

The current release passed **41 fixture/database tests** and **12 browser acceptance checks** locally. CI verifies each new push and pull request; its results are separate from those recorded local checks.

## Project layout

```text
src/app/                  Routes and request handlers
src/components/workspace/ Current product interface
src/lib/                  Discovery, matching, account isolation and data access
prisma/                   Schema and ordered migrations
tests/                    Contract fixtures and database integration tests
scripts/                  Local development and verification helpers
docs/                     Architecture and demonstration screenshots
extension/                Deferred companion source
```

See [architecture](docs/architecture.md) for the data flows and account boundaries, [security](SECURITY.md) for credential handling, and [changelog](CHANGELOG.md) for the release history.

## Repository access

This repository is private and intended for explicitly invited collaborators. Environment files, production administration notes, databases, credentials, browser sessions and test output are excluded from Git. The checked-in `.env.example` contains placeholders and development-only defaults.

Access can be managed by the owner under **Settings → Collaborators**. No public redistribution license is granted by repository access.
