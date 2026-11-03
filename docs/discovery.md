# Discovery operations

The catalogue contains public employer data only. `CatalogBoard`, `CatalogJob` and `CatalogSync` are shared; every private save uses the existing workspace-scoped tables. Exporting or deleting an account does not export another account's state or erase the public catalogue.

## Initialise

1. Apply committed migrations with `npm run db:migrate`.
2. Generate a random secret of at least 32 characters. Store it as the **production Secret** `CATALOG_REFRESH_SECRET` on Vercel and as an Actions secret with the same name in the private repository. Do not commit the value.
3. Set the Actions variable `CATALOG_REFRESH_URL` to the canonical production origin plus `/api/catalog/refresh`.
4. Deploy, then manually run **Refresh job catalogue** in GitHub Actions. It registers the curated boards and indexes their first complete snapshots. Subsequent scheduled runs poll due feeds. Initial results are not treated as newly posted.

The scheduler has no database credential, Vercel token or user session. Its key authorises only the shared, rate-bounded refresh. An authenticated POST to the same endpoint schedules a nonblocking refresh while browsing; neither route can force a refresh before the five-minute shared interval. The GET scheduler route requires the secret and never accepts it in query strings. The production host check remains active.

## Cadence and resource use

The GitHub workflow requests runs at minutes 13 and 43, avoiding the busy top of the hour. This is a requested cadence, not a delivery guarantee: observed runs in the November 2026 investigation were several hours apart. The shared workflow has a twelve-minute timeout and can also check/process an explicitly authorised application before the employer-feed step. Worker dependencies are installed only when that separate application task is pending. Scheduled Actions on private repositories consume the owner's runner-minute allowance. Monitor actual usage and the owner's budget; no spending limit is raised by this release.

Each refresh uses four source workers and a shared lease. It pages through due boards within its existing 160-second start-work deadline rather than stopping after the first 120 boards. Feeds have adaptive due times; failures back off for 30 minutes to six hours. A killed process cannot overlap a new refresh until its lease expires. Complete snapshots commit atomically per board. HTTP `304` advances the board's confirmation time without rewriting jobs. Content hashes avoid unchanged updates. Large boards are accepted up to 48 MB; unsupported or truncated responses leave the prior snapshot intact.

## Freshness and closures

- Publication timestamps are used only when explicitly supplied by the public API. Greenhouse update timestamps are not used as publication timestamps.
- A board's initial successful snapshot establishes its baseline. Later unseen jobs are marked newly discovered. This means “found since the previous scan,” not “posted at this exact time.”
- No daily re-import or content edit resets a job's first-discovery date.
- Missing IDs in a complete snapshot become inactive. A failed feed never triggers that operation. Feeds unconfirmed for 48 hours are excluded from search until a successful confirmation.
- Private saved copies, notes and application records survive retirement of a public listing.

## Coverage

The curated seed in `src/lib/catalog-boards.ts` is supplemented by the candidate registry in `src/data/catalog-candidates.json`, covering Greenhouse, Lever (including EU), Ashby, Workable and Recruitee. Candidates are not automatically advertised as active employers: complete feed validation and storage admission are required. The November 2026 production snapshot had 3,189 enabled boards and 19,822 configured candidates. No user can supply an arbitrary catalogue upstream URL. The separate manual importer still supports other Greenhouse and Lever companies.

Candidate expansion has its own lease and a bounded database admission budget. When storage is already above that budget, collecting more identifiers does not increase the searchable catalogue. Do not raise the budget without verifying actual infrastructure capacity. See [the 10x investigation](catalogue-10x-investigation.md) for measured storage, freshness and LinkedIn/Glassdoor access findings.

Use the production database's `CatalogBoard.error`, `failures`, `lastSuccessAt`, and `nextFetchAt` fields to diagnose stale sources. Do not log upstream bodies, database URLs, session cookies or scheduler credentials.
