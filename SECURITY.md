# Security

This is a private repository. Report suspected vulnerabilities privately to the repository owner through the existing trusted communication channel. Do not include passwords, tokens, connection strings, résumés, or other users' data in an issue or pull request.

## Credentials

- Store local credentials in ignored `.env` files; `.env.example` contains placeholders and loopback development defaults only.
- Configure production secrets directly in the hosting environment. Never put a server credential in a `NEXT_PUBLIC_` variable or the browser extension.
- Repository access does not grant access to production credentials or user data.
- If a real credential is ever committed, revoke or rotate it first. Removing a line from the latest commit does not remove it from Git history.

## Access boundaries

Hosted private data requires an application session and an account-scoped database context. Composite database relationships prevent records from linking across accounts. Private reads, mutations, exports and deletion paths have isolation tests.

Public signup does not imply public workspace data. Local mode is restricted to loopback and must not be enabled on a hosted deployment. AI and assisted form filling are deferred in the current release.

Email verification and email-based password recovery are not configured in this release. Do not represent accounts as email-verified or promise recovery emails that the application cannot send.
