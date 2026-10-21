# JobCompass

**A clearer place for your job search.**

Discover jobs from company boards, build a shortlist, and keep applications moving in a personal workspace.

[Features](#features) · [Local setup](#local-setup) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

![JobCompass discovery workspace with fictional demonstration data](docs/images/discovery.png)

## Features

- **Direct discovery:** import public Greenhouse and Lever company-board listings without an API key.
- **Your job library:** search stored opportunities, filter metadata, browse details, and skip or restore roles.
- **A focused shortlist:** save jobs and keep private notes and tags.
- **Application tracking:** maintain stages, notes, dates and an event timeline. Employer links never automatically mark a role Applied.
- **Personal matching:** set target roles, skills, locations and work preferences for deterministic matches.
- **Separate accounts:** hosted signup and sign-in with account-scoped data, exports and deletion controls.
- **Responsive interface:** consistent typography, desktop and mobile navigation, keyboard-accessible job details, and light/dark themes.

AI tools and assisted form filling are deferred. Supporting source remains in the repository, but those endpoints are disabled in the current release. Public accounts do not use the shared paid JSearch connection.

## How discovery works

Choose a platform and a company board token. Add keywords, then select **Find jobs**. Matching postings are stored in your workspace for browsing later.

For example, a careers URL ending in `job-boards.greenhouse.io/company` or `jobs.lever.co/company` uses `company` as its board token. Lever also supports an EU hosting region.

This searches **one selected company board**, not the entire job market. Imports use caching and stable source identities. Repeated imports update existing records; missing results never automatically delete or close a saved job. Country, salary, posting date and other absent fields remain unknown.

Current bounds: 8 MB per board response, 500 matching jobs per import, 10 seconds between direct attempts and 50 attempts per rolling 24 hours per workspace. Upstream failures are not automatically retried.

## Stack

| Layer | Technology |
| --- | --- |
| Application | Next.js, React, TypeScript |
| Data | PostgreSQL, Prisma |
| Accounts | Better Auth, database sessions |
| Styling | CSS, Tailwind, Lucide icons |
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

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Production PostgreSQL connection secret |
| `APP_ACCESS=hosted` | Require application sessions |
| `APP_URL` | Exact public HTTPS application origin |
| `BETTER_AUTH_SECRET` | Strong authentication signing secret, at least 32 characters |
| `PUBLIC_SIGNUP=true` | Allow account creation |
| `ENABLE_AI=false` | Keep deferred tools disabled |
| `OWNER_EMAIL` | Legacy workspace attribution when migrating an existing owner-only installation |

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
