---
title: Home
nav_order: 1
---

# demo-maker

**demo-maker** is an open-source product demo video maker for websites. You describe the walkthrough in YAML; Playwright runs the clicks and records a consistent MP4. Edit the scenario when the UI changes and re-run — no manual clicking or re-recording. It is not an AI presentation or slide-deck maker.

Product UIs keep changing, so demo videos go stale. Re-recording by hand (or asking an agent to “just make a video”) is slow, costly, and still needs a human check.

With `demo-maker` you configure the walkthrough as YAML steps, then re-run whenever the UI changes:

First create a scenario YAML file:
```yaml
name: demo1-introduction
base_url: https://github.com
video:
  enabled: true
  dir: output/videos
  filename: demo1-introduction.mp4
  size: { width: 1920, height: 1080 }
steps:
  - action: title_card
    text: "From install to your first MP4"
  - action: navigate
    url: /a1knowhow/demo-maker/blob/main/docs/getting-started.md
    caption: "Getting started"
  - action: expect_visible
    locator:
      role: heading
      name: Getting started
  - ...
  - action: title_card
    text: "Try https://github.com/a1knowhow/demo-maker"
```

[See full yaml](https://github.com/a1knowhow/demo-maker/blob/main/examples/demo1-introduction.yaml)


Then run it:

```bash
npx demo-maker run examples/demo1-introduction.yaml
```

And create demo video (and if UI changed, update the relevant step and re-create):
<video src="https://github.com/user-attachments/assets/4f1ded4a-5874-43f9-9d67-17843164ac61" controls width="720" style="border: 1px solid rgba(128, 128, 128, 0.35); border-radius: 4px;"></video>

**Read this first:** [Getting started](./getting-started.md) (install → first run → first MP4).

Typed schema source of truth: [`src/types.ts`](https://github.com/a1knowhow/demo-maker/blob/main/src/types.ts).

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

## Suggested reading order

- Prefer opening **one topic file** over the whole tree.
- For a new scenario: getting-started → actions → locators → video-and-pacing.
- For a failing step: repairing-scenarios → locators.
- For composition: imports-and-fragments.

## FAQ

### What is a product demo video maker?

A product demo video maker turns a real product walkthrough into a shareable video. **demo-maker** does that for websites: YAML steps drive a browser with Playwright and produce a consistent MP4 you can re-run after UI changes.

### How is demo-maker different from an AI presentation maker?

AI presentation makers build slides or motion graphics from text. **demo-maker** films your actual website: configured clicks, navigations, and waits on the live UI — not a generated deck.

### How do I make a consistent website demo video without re-recording?

Write the walkthrough once as YAML, enable `video:`, then run `npx demo-maker run your-scenario.yaml`. When the product UI changes, edit the affected steps and re-run to get the same consistent demo again.

### Is demo-maker open source?

Yes. **demo-maker** is open source (Apache-2.0) on [GitHub](https://github.com/a1knowhow/demo-maker) and published as [`@a1knowhow/demo-maker`](https://www.npmjs.com/package/@a1knowhow/demo-maker) on npm.

## About A1KnowHow

demo-maker was created originally for building demo videos for [A1KnowHow](https://a1knowhow.com/) — AI workflows, document organisation, chat, search, and AI agents with skills and MCP tool integration.
