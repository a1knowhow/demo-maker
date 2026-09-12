# CLI

Purpose: Commands and flags for the `demo-maker` binary.

```bash
demo-maker --help
demo-maker <command> …
```

## Commands

| Command | Purpose |
|---------|---------|
| `run <scenario.yaml>` | Execute a scenario (optional video) |
| `check <scenario.yaml>` | Same as `run --fail-fast --fast` (runtime smoke) |
| `record` | Live-record browser actions to YAML |
| `import <recording.json> -o <out.yaml>` | Convert recorder / DevTools JSON → YAML |
| `export-chapters <timing.json\|dir>` | Emit YouTube chapter lines |

Back-compat: if the first argument ends in `.yaml` / `.yml`, it is treated as `run`.

## `run` / `check` flags

| Flag | Purpose |
|------|---------|
| `--env-file=PATH` | Load `KEY=value` for auth and `{{ VAR }}`; `BASE_URL` overrides scenario `base_url` |
| `--base-url=URL` | Override `base_url` (wins over env `BASE_URL`) |
| `--headless` | No browser window |
| `--fast` | Zero/minimal pacing delays |
| `--fail-fast` | Stop on first step failure |
| `--end-step=N` | Run only steps 1..N (1-based inclusive) |
| `--pause-at-end` | Headed: wait for Enter before closing browser |
| `--debug-dir=PATH` | Save PNG on step failure |
| `--storage-state=PATH` | Load Playwright storage state (cookies/localStorage) |
| `--save-storage-state=PATH` | Save storage state after the run |
| `--capture-from-url VAR=regex` | Capture first regex group from page URLs into `{{ VAR }}` (repeatable) |
| `--url-capture-file=PATH` | JSON array of `{ variable, pattern }` rules (see [URL capture](./url-capture.md)) |

Examples:

```bash
npx demo-maker run scenarios/demo.yaml --env-file scenarios/u2.env --fast
demo-maker check scenarios/demo.yaml --env-file scenarios/u2.env --storage-state=scenarios/session.json
npx demo-maker run scenarios/demo.yaml --end-step=7 --pause-at-end --env-file scenarios/u2.env
```

## `record` flags (summary)

| Flag | Purpose |
|------|---------|
| `--save-to=PATH` | Output YAML path |
| `--save-json=PATH` | Also write raw recording JSON |
| `--url=URL` / `--base-url=URL` | Start URL / base |
| `--continue-from=PATH` | Replay YAML then record additional steps |
| `--from=PATH` | Import from JSON instead of live record |
| `--fast` | Fast replay when using `--continue-from` |
| `--env-file=PATH` | Env for replay auth / variables |
| `--end-step=N` | With continue-from: replay only 1..N |

See [Recording](./recording.md).

## `export-chapters`

```bash
demo-maker export-chapters path/to/video.timing.json
demo-maker export-chapters output/videos   # newest *.timing.json in dir
```

## Requirements

- Node 20+
- Playwright Chromium (`npx playwright install chromium`)
- ffmpeg on `PATH` for `.mp4`, `cut_video` splice, background audio
