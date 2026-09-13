---
title: Video and pacing
nav_order: 10
---

{% raw %}
# Video and pacing

Purpose: Recording quality, overlays, ffmpeg post-processing, and timing.

Requires **ffmpeg** on `PATH` for `.mp4`, trim/splice (`start_step`/`end_step`, `cut_video`), and background audio.

## Video config

```yaml
video:
  enabled: true
  dir: "output/videos"           # relative to process cwd
  filename: "demo-[date:\"YYYY-MM-DD-HHmm\"].mp4"
  size: { width: 1920, height: 1080 }      # final output
  viewport: { width: 1440, height: 810 }   # browser render (optional)
  start_step: 11                 # optional trim (1-based); needs ffmpeg
  end_step: 40
  caption_parallel: true         # optional
  playback_speed: 1.25           # optional; .mp4 only
```

| Field | Notes |
|-------|--------|
| `enabled` | Must be `true` to record |
| `dir` | Created if missing; relative to **cwd**, not the YAML path |
| `filename` | Optional; `.mp4` triggers H.264 re-encode (CRF 18). Supports `[date:"…"]` |
| `size` | Final resolution (YouTube-oriented default 1920×1080) |
| `viewport` | Browser size; if smaller than `size`, ffmpeg upscales (lanczos). Use on laptops so headed Chrome fits the screen |
| `start_step` / `end_step` | Trim saved video after full run |
| `caption_parallel` | If true, caption overlay does not block the next step |
| `playback_speed` | Speed final MP4 (`setpts`); chapters remapped; BGM stays normal tempo |

Playwright records VP8 WebM internally; `.mp4` re-encodes to H.264 (`libx264`, `yuv420p`, `faststart`).

## Captions

Any step may set `caption:`. With video enabled, a bottom overlay is shown after the step. Default: wait ~2.5s before the next step. With `caption_parallel: true`, the caption fades on a timer while the next steps run.

Optional `caption_style: chapter` — full-width bottom bar, larger type.

Prefer few captions (scene intent), not every click. Supports `{{ ENV }}`.

## Scene polish actions

| Action | Role |
|--------|------|
| `title_card` | Full-screen chapter title (`text`, `hold_ms`, `fade_ms`) |
| `transition` | Fade to black (`fade_ms`; optional `hold_ms` for outro) |
| `cut_video` | Exclude nested duration from MP4; optional `title_card` placeholder |
| `video_exclude: true` | Exclude a single step |

## Background audio

```yaml
audio:
  background: path/to/music.mp3
```

Mixed into the final MP4 via ffmpeg (when producing `.mp4`).

## Timing and chapters

On success with video, the runner writes `<basename>.timing.json` beside the video. Chapter timestamps remap after splice/speed.

```bash
demo-maker export-chapters output/videos/demo.timing.json
demo-maker export-chapters output/videos
```

Use `action: log` with `── Scene N: Title` and/or `caption:` for chapter labels. Excluded (`cut_video`) steps are omitted from chapter export.

## Pacing fields

| Field | Role |
|-------|------|
| `step_delay_ms` | After each step |
| `slow_mo_ms` | Playwright slowMo |
| `typing_delay_ms` | Between keystrokes (`type`); per-step override OK |
| `post_click_delay_ms` | After click settle |
| `navigate_hold_ms` | After navigate settle |
| `pre_action_delay_ms` | Before navigate/click |

`--fast` disables pacing for smoke checks.

Hold on a frame for video:

```yaml
- action: wait
  timeout_ms: 4000
```

## Recommended YouTube settings (laptop)

```yaml
video:
  enabled: true
  dir: output/videos
  filename: demo-[date:"YYYY-MM-DD-HHmm"].mp4
  size: { width: 1920, height: 1080 }
  viewport: { width: 1440, height: 810 }
```

On a large external display, omit `viewport` for native 1080p rendering.

## Related

- [Actions](./actions.md) (`title_card`, `cut_video`, `wait`)
- [Variables](./variables.md) (filename templates)
- [Getting started](./getting-started.md)
{% endraw %}
