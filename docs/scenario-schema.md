---
title: Scenario schema
nav_order: 4
---

# Scenario schema

Purpose: Top-level YAML fields for an entry scenario. Typed definitions: [`src/types.ts`](https://github.com/a1knowhow/demo-maker/blob/main/src/types.ts).

**Metadata rule:** Only the **entry** file (the path you pass to `npx demo-maker run`) supplies `name`, `base_url`, `video`, pacing, `auth`, etc. Imported files contribute **steps only**.

## Required / common fields

```yaml
name: string                    # required
description: string             # optional (may be empty)
base_url: string                # default http://localhost:2000/
imports: [path, ...]            # optional; prepended steps from other files
metadata: { ... }               # optional; arbitrary (e.g. YouTube paste); ignored by runner
auth:
  email_env: ENV_VAR_NAME
  password_env: ENV_VAR_NAME
steps: []                       # required array of steps or { import: path }
```

## Pacing (optional, milliseconds)

| Field | Role |
|-------|------|
| `step_delay_ms` | Delay after each step |
| `slow_mo_ms` | Playwright slowMo after every browser action |
| `typing_delay_ms` | Delay between keystrokes for `type` (per-step override allowed) |
| `post_click_delay_ms` | Hold after click (after settle) |
| `navigate_hold_ms` | Hold after navigate (after DOM settle) |
| `pre_action_delay_ms` | Delay before navigate/click |
| `action_timeout_ms` | Default Playwright action timeout (default 10000) |

`--fast` overrides pacing to near-zero for smoke runs.

## Video / audio / screenshots

See [Video and pacing](./video-and-pacing.md).

```yaml
video:
  enabled: true
  dir: output/videos
  filename: demo-[date:"YYYY-MM-DD-HHmm"].mp4
  size: { width: 1920, height: 1080 }
  viewport: { width: 1440, height: 810 }
  start_step: 3
  end_step: 20
  caption_parallel: true
  playback_speed: 1.0

audio:
  background: path/to/track.mp3   # mixed into final MP4 via ffmpeg

screenshots:
  dir: output/screenshots

device_scale_factor: 2             # optional; crisp PNG screenshots
```

## Storage state

```yaml
storage_state: session.json       # load
save_storage_state: session.json  # save after run

url_capture:                      # optional; see docs/url-capture.md
  - variable: workspace_id
    pattern: "/workspace/([^/]+)"
```

CLI `--storage-state` / `--save-storage-state` override these.

## Steps

Each item is either:

- A normal step with `action: …` (see [Actions](./actions.md)), or
- `{ import: "relative/path.yaml" }` (see [Imports](./imports-and-fragments.md))

Any step may include optional `caption:`, `timeout_ms:`, `video_exclude: true`, and action-specific fields.
