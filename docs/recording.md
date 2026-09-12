# Recording

Purpose: Capture browser actions into YAML (or import from JSON).

## Live record

Uses Playwright’s recorder API (codegen without the Inspector UI). Actions stream to the CLI; **Ctrl+C** writes YAML.

```bash
demo-maker record \
  --save-to scenarios/recorded.yaml \
  --save-json scenarios/recording.json \
  --url http://localhost:3000/ \
  --base-url http://localhost:3000/
```

- `--save-to` — required output YAML
- `--save-json` — optional raw JSON for later `--from` / `import`
- Refuses to overwrite an existing `--save-to` on a fresh live record (delete/rename first)

Edit captions, variables, and locators after saving, then `npx demo-maker run`.

## Continue from existing YAML

Replay a prefix scenario, then record additional steps (e.g. login once, then capture a new flow).

```bash
demo-maker record \
  --continue-from scenarios/01.login.yaml \
  --save-to scenarios/recorded-segment.yaml \
  --fast \
  --env-file scenarios/u2.env
```

- On Ctrl+C, saved YAML contains **only newly recorded steps** plus top-level `imports` pointing at the continue-from file (relative path).
- Overwrite of `--save-to` is allowed with `--continue-from`.
- `--end-step=N` limits replay to steps 1..N before recording starts.
- If replay fails, the process exits and does **not** start recording.

## Import from JSON

Convert demo-maker recorder JSON or Chrome DevTools Recorder (Puppeteer Replay) JSON:

```bash
demo-maker record --from recording.json --save-to scenario.yaml --base-url http://localhost:3000/
# or
demo-maker import recording.json -o scenario.yaml --base-url http://localhost:3000/
```

## After recording

1. Replace brittle selectors with `role` / `label` / `text` where possible ([Locators](./locators.md))
2. Add `caption:` sparingly (scene titles, not every click)
3. Wire `{{ auth.* }}` / env vars ([Variables](./variables.md))
4. Enable `video:` when ready ([Video and pacing](./video-and-pacing.md))

## Repair loop

See [Repairing scenarios](./repairing-scenarios.md) for detect → isolate → continue-from → transplant locators → verify.
