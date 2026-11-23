# Security

Report suspected vulnerabilities privately through GitHub's **Security → Report a vulnerability** form for this repository, not in a public issue. Do not include passwords, tokens, connection strings, résumés, or other users' data in an issue, pull request or report.

## Credentials

Run `npm run check:secrets` before pushing. It scans the Git index for private/generated files and common credential patterns. Locally it also compares tracked text against configured secrets without printing their values. CI runs the same tracked-file scan. This is an additional check, not a substitute for careful review.

- Store local credentials in ignored `.env` files; `.env.example` contains placeholders and loopback development defaults only.
- Configure production secrets directly in the hosting environment. Never put a server credential in a `NEXT_PUBLIC_` variable or the browser extension.
- Repository access does not grant access to production credentials or user data.
- If a real credential is ever committed, revoke or rotate it first. Removing a line from the latest commit does not remove it from Git history.

## Access boundaries

Hosted private data requires an application session and an account-scoped database context. Composite database relationships prevent records from linking across accounts. Private reads, mutations, exports and deletion paths have isolation tests.

Public signup does not imply public workspace data. Local mode is restricted to loopback and must not be enabled on a hosted deployment. Optional personal-key AI has a separate `off` / `owner` / `byok` policy enforced on every operation; there is no shared server-side AI key. The owner-preview form-filling companion only fills forms: it has no submit path, and its API accepts requests only from the published extension ID with a short-lived, job-bound grant.

User-supplied AI keys are held in tab memory and forwarded only to the selected fixed HTTPS provider endpoint for an explicit request. They are never written to database records, exports, browser storage or application logs. AI source text and reports are private account records; users explicitly consent before sending inputs to a provider and can remove their stored reviews. Redirects, arbitrary provider URLs and automatic retries are refused. See [personal AI](docs/personal-ai.md) for the data flow and its limits.

Email verification and email-based password recovery are not configured in this release. Do not represent accounts as email-verified or promise recovery emails that the application cannot send.
