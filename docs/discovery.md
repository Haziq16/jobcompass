# Discovery operations

The catalogue contains public employer data only. `CatalogBoard`, `CatalogJob` and `CatalogSync` are shared; every private save uses the existing workspace-scoped tables. Exporting or deleting an account does not export another account's state or erase the public catalogue.

## Initialise

1. Apply committed migrations with `npm run db:migrate`.
2. Generate a random secret of at least 32 characters. Store it as the **production Secret** `CATALOG_REFRESH_SECRET` on Vercel and as an Actions secret with the same name in the private repository. Do not commit the value.
3. Set the Actions variable `CATALOG_REFRESH_URL` to the canonical production origin plus `/api/catalog/refresh`.
4. Deploy, then manually run **Refresh job catalogue** in GitHub Actions. It registers the curated boards and indexes their first complete snapshots. Subsequent scheduled runs poll due feeds. Initial results are not treated as newly posted.

The scheduler has no database credential, Vercel token or user session. Its key authorises only the shared, rate-bounded refresh. An authenticated POST to the same endpoint schedules a nonblocking refresh while browsing; neither route can force a refresh before the five-minute shared interval. The GET scheduler route requires the secret and never accepts it in query strings. The production host check remains active.

## Cadence and resource use

The GitHub workflow runs at minutes 13 and 43, avoiding the busy top of the hour. GitHub schedules can be delayed and are not a strict freshness SLA. It has a four-minute timeout, uses no checkout or dependency install, and exposes only a count summary. Scheduled Actions on private repositories consume the owner's runner-minute allowance. Monitor actual usage and the owner's budget; no spending limit is raised by this release.

Each refresh uses four source workers and a shared lease. Feeds normally become due after five minutes, failures back off for 30 minutes to six hours, and fetching stops starting additional boards after 160 seconds. A killed process cannot overlap a new refresh until its lease expires. Complete snapshots commit atomically per board. HTTP `304` advances the board's confirmation time without rewriting jobs. Content hashes avoid unchanged updates. Large boards are accepted up to 48 MB; unsupported or truncated responses leave the prior snapshot intact.

## Freshness and closures

- Publication timestamps are used only when explicitly supplied by the public API. Greenhouse update timestamps are not used as publication timestamps.
- A board's initial successful snapshot establishes its baseline. Later unseen jobs are marked newly discovered. This means “found since the previous scan,” not “posted at this exact time.”
- No daily re-import or content edit resets a job's first-discovery date.
- Missing IDs in a complete snapshot become inactive. A failed feed never triggers that operation. Feeds unconfirmed for 48 hours are excluded from search until a successful confirmation.
- Private saved copies, notes and application records survive retirement of a public listing.

## Coverage

The registry in `src/lib/catalog-boards.ts` currently contains 64 verified company boards across Greenhouse, Lever and Ashby. It is curated and technology-heavy. Add verified boards there and deploy; no user can supply an arbitrary catalogue upstream URL. The separate manual importer still supports other Greenhouse and Lever companies.

Use the production database's `CatalogBoard.error`, `failures`, `lastSuccessAt`, and `nextFetchAt` fields to diagnose stale sources. Do not log upstream bodies, database URLs, session cookies or scheduler credentials.
