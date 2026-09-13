---
title: Actions
nav_order: 5
---

# Actions

Purpose: Reference for every `action:` value in scenario steps. Schema: [`src/types.ts`](https://github.com/a1knowhow/demo-maker/blob/main/src/types.ts).

Any step may include optional `caption:` (overlay/log) and `timeout_ms:` (default 10000 unless overridden by `action_timeout_ms`).

## Action table

| Action | Required | What it does |
|--------|----------|--------------|
| **navigate** | `url` | Opens a URL (relative to `base_url`). Waits for DOM ready, rAF paint, then `navigate_hold_ms`. |
| **click** | `locator` | Clicks the matched element. Optional `settle_until` after click. Then `post_click_delay_ms`. |
| **drag** | `locator`, `offset_x` | Press at element center, drag by `offset_x` / `offset_y` (default `offset_y: 0`), release. Honors pre/post click delays. |
| **type** | `locator`, `value` | Clears then types character-by-character (unless `clear_before_type: false`). Real input events. `{{ variables }}` in `value`. Optional per-step `typing_delay_ms`. |
| **fill** | `locator`, `value` | Sets value in one go (faster; fewer input events). `{{ variables }}` supported. |
| **wait** | see modes | Fixed delay, URL match, or until locator hidden (optional page refresh). |
| **expect_visible** | `locator` | Waits until element is visible; fails if not within timeout. |
| **screenshot** | `screenshots.dir` | HD PNG of page or `locator`. Optional `screenshot: { file, full_page, omit_background, scale }`. |
| **pause** | — | Wait for Enter in terminal. Skipped in `--headless`. |
| **log** | `message` | Log line (use `── Scene N: …` for chapter export). |
| **title_card** | `text` | Full-screen scene title (fade/hold). Optional `hold_ms` (default 1800), `fade_ms` (default 400). |
| **transition** | — | Fade-to-black. Optional `fade_ms` (default 500). Optional `hold_ms` holds black (outro). |
| **cut_video** | `steps` | Run nested steps in browser but splice them out of the final video (ffmpeg). Optional `placeholder` (`title_card`). |
| **repeat_while_visible** | `locator`, `steps` | Loop nested steps while locator visible; optional `max_iterations` (default 100). |

## Wait modes

| Mode | YAML | Use when |
|------|------|----------|
| Fixed delay | `wait` + `timeout_ms` only | Video pacing, brief pause |
| URL | `until: url` + `url_pattern` | SPA navigation finished |
| Until hidden | `until: hidden` + `locator` + `timeout_ms` | Poll until no matches |
| Hidden + refresh | above + `refresh_every_ms` (≥ 500) | SPA status that only updates on reload |

`url_pattern` supports `{{ variables }}`. If the string is slash-wrapped (`"/edit-doc/"`), the inner part is the RegExp source. Optional flags: `/pattern/gimsuy`. Uses `waitUntil: "commit"` for SPA client navigations.

```yaml
- action: wait
  timeout_ms: 2000

- action: wait
  until: url
  url_pattern: "/dashboard"

- action: wait
  until: hidden
  locator:
    selector: '[aria-label="Document status: Processing"]'
  timeout_ms: 180000
  refresh_every_ms: 5000
```

## `settle_until` (click only)

Exactly one of:

- `settle_until: { locator: … }` — wait until that element is **visible**
- `settle_until: { text: "Exact visible string" }` — exact text (`getByText` exact); supports `{{ variables }}`

```yaml
- action: click
  locator: { role: button, name: Create }
  settle_until:
    locator: { label: Name }
```

## `select_confirm` (`fill` / `type` on `<select>`)

When `select_confirm: true` on a fill/type targeting a `<select>`:

1. Wait until an `<option>` exists whose visible text or `value` equals the step `value`
2. Select (label-first, then value)
3. Verify selection applied

Use for dynamic dropdowns where options load asynchronously.

## `drag`

```yaml
- action: drag
  locator:
    selector: .splitpanes--vertical .splitpanes__splitter
  offset_x: -180
- action: wait
  timeout_ms: 400
```

Negative `offset_x` drags left.

## Screenshots

```yaml
screenshots:
  dir: "output/screenshots"
device_scale_factor: 2

steps:
  - action: navigate
    url: "/app"
  - action: screenshot
    caption: "Main list"
    screenshot:
      file: "list.png"
      scale: device
  - action: screenshot
    locator: { role: heading, name: Settings }
    screenshot:
      file: "heading.png"
```

## `cut_video` and `video_exclude`

Run long waits in the browser but keep them out of the MP4:

```yaml
- action: cut_video
  placeholder:
    action: title_card
    text: "Indexing…"
    hold_ms: 2000
  steps:
    - action: wait
      timeout_ms: 2000
    - action: wait
      until: hidden
      locator:
        selector: '[aria-label="Status: Processing"]'
      timeout_ms: 180000
      refresh_every_ms: 5000
```

Single-step exclude: set `video_exclude: true` on any step. Requires ffmpeg. See [Video and pacing](./video-and-pacing.md).

## `repeat_while_visible`

```yaml
- action: repeat_while_visible
  locator: { role: button, name: /Delete/i }
  max_iterations: 50
  steps:
    - action: click
      locator: { role: button, name: /Delete/i }
    - action: click
      locator: { role: button, name: /Confirm/i }
```

## Pause (debug)

```yaml
- action: pause
  caption: "Inspect the page, then press Enter."
```

Skipped in `--headless`. Prefer `wait` + `timeout_ms` for video pacing.

## Related

- [Locators](./locators.md)
- [Scenario schema](./scenario-schema.md)
- [Video and pacing](./video-and-pacing.md)
