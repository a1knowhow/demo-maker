# Contributing

1. Fork and clone the repo.
2. `npm install && npx playwright install chromium`
3. `npm test` before opening a PR.
4. Keep the public API stable: prefer additive changes to the YAML schema and export new types from `src/index.ts`.
5. Do not commit secrets, `session.json`, or product-specific private demo cases.
6. Docs live in [`docs/`](./docs/index.md) (published at [a1knowhow.github.io/demo-maker](https://a1knowhow.github.io/demo-maker/)) — update the relevant topic file when changing actions, CLI flags, or schema.

## Adding an action

1. Extend `ActionType` / `DemoStep` in `src/types.ts`
2. Validate in `src/parse.ts`
3. Execute in `src/runner.ts`
4. Add unit tests under `tests/`
5. Document in `docs/actions.md`
