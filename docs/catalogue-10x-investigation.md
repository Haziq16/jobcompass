# Catalogue expansion: LinkedIn, Glassdoor and the 10x target

Investigated 3 November 2026. Counts below are a production snapshot, not a live counter. The requested 10x increase is **not achieved** by this investigation or by the refresh fix.

## Baseline and target

An account-independent, read-only production transaction measured 38,707 active jobs on enabled boards confirmed within 48 hours, and 38,707 distinct stored application URLs. The target is therefore **387,070 searchable jobs**. URL uniqueness does not prove distinct employer requisitions across different sites.

The public table contains 100,413 rows: 90,494 marked active and 9,919 inactive. There are 3,189 enabled employer boards. Many active rows are correctly hidden because their employer feed has not been confirmed recently; freshness recovery must not merely relax that rule or reset publication dates.

The database occupied 991,502,336 bytes (about 946 MiB). CatalogJob occupied 973,119,488 bytes including indexes/TOAST. Its indexes occupied 184,786,944 bytes; stored descriptions about 309 MB and stored search text about 284 MB. These observations explain why candidate expansion is already paused above its existing 750 MiB admission budget. Raising that budget is not a storage solution.

## REA runtime evidence

REA MCP tools were absent from this agent session. The pinned REA 6.7.0 doctor reported aligned Codex registration. The investigation therefore used the supported CLI browser-scenario fallback, with owned temporary Chrome profiles and no credentials. Both browsers were terminated by REA after capture; no client configuration was changed.

| Target                                                | Evidence ID                                                           | Direct observation                                                                         | Boundary                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| LinkedIn public jobs                                  | `ev_d605870666ebb33ee8383e2ad8928a8ee2bba8735ef805d792ad956b00c835b3` | Optional sign-in dialog on the jobs search page                                            | No authenticated recommendations or export API observed                                                       |
| LinkedIn public jobs, after its normal Dismiss button | `ev_0f48e520924f1bd05087cb778f9b0513aacd47c1cff0fd8fb6681a2f7f642ab6` | Public title/company/location/date cards, job links and date/company filters were readable | One public page, not evidence of unrestricted pagination, application access or worldwide coverage            |
| Glassdoor public jobs                                 | `ev_d14cb988f82faebe1f362c03467d970abb97bd9d354bb2f1cfe51014141f6744` | “Humans only” security page                                                                | Search payloads, authenticated behavior and reliable collection remain unknown; no challenge bypass attempted |

Complete local Evidence is retained in ignored `test-results/*-rea-evidence.json`; do not publish raw challenge URLs, browser fingerprint text or host metadata. This report intentionally records only the findings needed for the catalogue decision. DOM/static strings do not establish server internals or actual collection reliability.

## Source and API findings

- LinkedIn's documented [Job Posting API](https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview) is partner restricted and describes publishing jobs. It is not evidence that this application has permission or credentials for a bulk read catalogue.
- [JobSpy](https://github.com/speedyapply/JobSpy) has open-source LinkedIn and Glassdoor adapters. Its own documentation reports roughly 1,000-result per-search limits and rate limiting. Those are upstream claims, not throughput verified in this investigation. Its existence does not guarantee access, coverage or 10x unique growth on our infrastructure.
- Glassdoor's old `/developer/index.htm` returned 404 during research. This bounded observation does not prove that every partner API is unavailable. The actual REA browser was blocked, so no production Glassdoor collector is represented as working.
- Employer feeds remain the verified ingestion route. LinkedIn/Glassdoor-derived links would need canonical employer requisition/application deduplication, validated descriptions and honest source/date provenance before admission. A search-page count is not an imported-job count.

## Immediate recoverable issue

Recent scheduled workflow starts were separated by several hours despite the configured twice-hourly cron. Successful refresh steps processed exactly 120 boards in approximately 15–33 seconds, leaving much of the existing 160-second source-fetch budget unused. With thousands of boards, that cap prevented the catalogue from staying verified.

The refresh recovery change pages through due boards within the existing deadline and four-worker limit. It preserves shared leases, conditional requests, failure backoff, complete-snapshot publication and the 48-hour search gate. It does not increase subscriptions, bypass the expansion admission budget, manufacture newly posted dates or promise scheduler delivery times.

## Capacity needed for 387,070 jobs

At the current observed layout, public records cost approximately 9.7 KB each including table/index allocation. A linear extrapolation for the requested target is roughly 3.75 GB before operating headroom and other data; actual incremental storage needs measurement because allocation, compression and index growth are not linear.

Removing duplicate stored search text while preserving an equivalent expression index could reduce storage, but does not by itself establish capacity for the target. A free-budget redesign would require a compact searchable catalogue plus separately retained or verified-on-demand full descriptions, with explicit search/availability tradeoffs. It must not silently truncate evidence needed for matching or CV tailoring. A larger storage plan is the alternative, subject to the owner's budget decision.

For context, [Neon's current pricing](https://neon.com/pricing) lists 1 GB of Postgres storage per free project and says storage-increasing operations fail at the limit. This is published plan information, not a claim that this project's billing configuration was changed or independently audited.

## Completion ledger

- Current baseline and 10x target: measured.
- Public LinkedIn behavior: observed; bulk collection and deduplicated yield remain unproven.
- Public Glassdoor behavior: access blocker observed; collection unresolved.
- Existing refresh bottleneck: identified and addressed by the accompanying code change.
- 387,070 verified unique jobs: **not reached**. Storage capacity and additional verified source yield remain prerequisites.

No private CVs or profile data were sent to LinkedIn or Glassdoor. No employer applications, paid scraping services, proxy rotation, authentication bypass or subscription changes were performed for this investigation.
