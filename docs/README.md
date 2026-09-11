# Documentation

Purpose: Index for humans and AI agents working with `@a1knowhow/demo-maker`.

**Read this first:** [Getting started](./getting-started.md) (install → first run → first MP4).

Typed schema source of truth: [`src/types.ts`](../src/types.ts).

## Topic map

| Doc | When to open it |
|-----|-----------------|
| [Getting started](./getting-started.md) | Zero → first successful run and video |
| [CLI](./cli.md) | Commands and flags |
| [Scenario schema](./scenario-schema.md) | Top-level YAML fields |
| [Actions](./actions.md) | What each `action:` does |
| [Locators](./locators.md) | Targeting UI elements |
| [Variables](./variables.md) | `{{ }}` and filename template functions |
| [Imports and fragments](./imports-and-fragments.md) | Reusable YAML composition |
| [Recording](./recording.md) | Live record, continue-from, import |
| [Video and pacing](./video-and-pacing.md) | MP4, captions, title cards, cut_video |
| [Repairing scenarios](./repairing-scenarios.md) | Fix YAML after UI changes |
| [Library API](./library-api.md) | Use from TypeScript |
| [URL capture](./url-capture.md) | Capture IDs from page URLs into `{{ vars }}` |

## Agent loading tips

- Prefer opening **one topic file** over the whole tree.
- For a new scenario: getting-started → actions → locators → video-and-pacing.
- For a failing step: repairing-scenarios → locators.
- For composition: imports-and-fragments.

## Similar tools (brief)

Demo-maker is in the “demo as code” family: declarative steps → Playwright → video. Close peers include [demo-machine](https://github.com/45ck/demo-machine), [Clipwise](https://github.com/kwakseongjae/clipwise), and [SceneForge](https://github.com/jhandel/sceneforge). Strengths here: composable imports, locator abstraction, storage-state auth, captions/chapters, and a repair loop (`record --continue-from`).
