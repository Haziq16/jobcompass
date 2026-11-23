# Contributing

Contributions are welcome. Work in a branch (or fork) and open a pull request with a short explanation of the problem, the change, and relevant validation. Report security issues privately as described in [SECURITY.md](SECURITY.md), not in a public issue or pull request.

## Development

Follow the setup in [README.md](README.md). Use Node.js 24 and the committed npm lockfile. Read the local Next.js guides referenced by `AGENTS.md` before changing framework-specific behavior.

Before opening a pull request:

```sh
npm run lint
npm test
npm run test:migration
npm run build
npm run typecheck
```

The database tests use disposable local databases. Never point them at production. For visual changes, also run the browser checks with local Chrome and inspect desktop and mobile screenshots.

## Project conventions

- Keep all private workspace queries inside the authenticated account context.
- Preserve workspace ownership constraints and test cross-account access when changing data paths.
- Keep discovery explicit. Opening a stored job must not call an upstream provider.
- Preserve unknown metadata instead of inventing country, salary or work-arrangement values.
- JobCompass never submits applications. Do not add code that clicks an employer's submit button or sends an application without the user doing it themselves.
- Keep AI behind its explicit, per-request user consent and the `AI_MODE` policy; never add shared server keys or automatic provider calls.
- Do not commit credentials, database contents, private résumés, cookies, session files, or production logs. Use fictional fixtures only (for example `@example.test` addresses).

CI runs lint, isolated tests, migration preservation, type checking and the production build. A successful check is evidence for that commit; do not describe unrun checks as passing.
