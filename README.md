# demo-maker

🎬 **Demo videos as code** — configure once, re-run forever. YAML + Playwright → polished, consistent product feature videos.

Turn versioned scenario configs into consistent product feature videos — reconfigure, re-run, no manual re-recording.

## Why?

Product UIs keep changing, so demo videos go stale. Re-recording by hand (or asking an agent to “just make a video”) is slow, costly, and still needs a human check.

With demo-maker you version the walkthrough as YAML: edit steps, re-run, get the same MP4. Fragments and imports make flows reusable; you or an agent can maintain the scripts like code.

**Side effect:** writing stable locators surfaces real UI gaps—missing labels, duplicate accessible names, hard-to-target list rows—so you often fix accessibility while building the demo.

## Requirements

- **Node.js** 20+
- **Playwright Chromium** (`npx playwright install chromium`)
- **ffmpeg** on `PATH` (MP4 re-encode, `cut_video` splice, background audio)

## Install

Published on npm as [`@a1knowhow/demo-maker`](https://www.npmjs.com/package/@a1knowhow/demo-maker):

```bash
npm install -D @a1knowhow/demo-maker
npx playwright install chromium
```

Or from a clone:

```bash
npm install
npx playwright install chromium
```

The package ships TypeScript source and runs via `tsx`. Library imports (`import … from "@a1knowhow/demo-maker"`) need a TypeScript-capable toolchain (tsx, Vitest, or a bundler). See [Security](./SECURITY.md) for runtime capabilities.

## Quick start

```bash
npx demo-maker run examples/smoke.yaml --headless --fast
```

Step-by-step (install → first MP4 → record → fragments): **[Getting started](https://a1knowhow.github.io/demo-maker/getting-started.html)** · [docs on GitHub](./docs/getting-started.md)

## Example walkthrough

Intro tour: open this repo on GitHub and walk getting-started → actions → locators (imports, title cards, captions, pacing):

```bash
npx demo-maker run examples/demo1-introduction.yaml
```

<video src="https://github.com/user-attachments/assets/4f1ded4a-5874-43f9-9d67-17843164ac61" controls width="720"></video>

[View logs](./examples/files/demo1-introduction-run.log)

Richer CI walkthrough (Actions → green run → test job):

```bash
npx demo-maker run examples/demo2-github-actions.yaml
```

([`examples/demo1-introduction.yaml`](./examples/demo1-introduction.yaml) · [`examples/demo2-github-actions.yaml`](./examples/demo2-github-actions.yaml) · [`examples/smoke.yaml`](./examples/smoke.yaml) for a minimal check)

## Documentation

Site: **[https://a1knowhow.github.io/demo-maker/](https://a1knowhow.github.io/demo-maker/)**


| Topic                   | Docs site | Source |
| ----------------------- | --------- | ------ |
| Index                   | [docs site](https://a1knowhow.github.io/demo-maker/) | [docs/index.md](./docs/index.md) |
| Getting started         | [getting started](https://a1knowhow.github.io/demo-maker/getting-started.html) | [docs/getting-started.md](./docs/getting-started.md) |
| CLI                     | [CLI](https://a1knowhow.github.io/demo-maker/cli.html) | [docs/cli.md](./docs/cli.md) |
| Actions                 | [actions](https://a1knowhow.github.io/demo-maker/actions.html) | [docs/actions.md](./docs/actions.md) |
| Locators                | [locators](https://a1knowhow.github.io/demo-maker/locators.html) | [docs/locators.md](./docs/locators.md) |
| Video & pacing          | [video & pacing](https://a1knowhow.github.io/demo-maker/video-and-pacing.html) | [docs/video-and-pacing.md](./docs/video-and-pacing.md) |
| Recording               | [recording](https://a1knowhow.github.io/demo-maker/recording.html) | [docs/recording.md](./docs/recording.md) |
| Repair after UI changes | [repairing](https://a1knowhow.github.io/demo-maker/repairing-scenarios.html) | [docs/repairing-scenarios.md](./docs/repairing-scenarios.md) |


Typed schema: [`src/types.ts`](./src/types.ts).

## Commands


| Command                            | Purpose                                 |
| ---------------------------------- | --------------------------------------- |
| `demo-maker run <scenario.yaml>`   | Execute scenario (optional video)       |
| `demo-maker check <scenario.yaml>` | `run` with `--fail-fast --fast`         |
| `demo-maker record`                | Live-record actions to YAML             |
| `demo-maker import`                | Convert DevTools / recorder JSON → YAML |
| `demo-maker export-chapters`       | Timing JSON → YouTube chapter lines     |




## Security

Report vulnerabilities privately — see [SECURITY.md](./SECURITY.md). Do not open public issues for security bugs.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).

## About A1KnowHow

demo-maker was created originally for building demo videos for [A1KnowHow](https://a1knowhow.com/) — AI workflows, document organisation, chat, search, and AI agents with skills and MCP tool integration.