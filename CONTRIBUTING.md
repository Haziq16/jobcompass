# Contributing

Access to this repository is by invitation. Work in a branch and open a pull request with a short explanation of the problem, the change, and relevant validation.

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
- Keep AI and companion tools disabled unless a separately reviewed release enables them.
- Do not commit credentials, database contents, private résumés, cookies, session files, or production logs.

CI runs lint, isolated tests, migration preservation, type checking and the production build. A successful check is evidence for that commit; do not describe unrun checks as passing.
