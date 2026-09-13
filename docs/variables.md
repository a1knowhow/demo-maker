---
title: Variables
nav_order: 7
---

# Variables and templates

Purpose: Runtime substitution in scenario strings.

## `{{ placeholders }}`

In `value:`, `url:`, string locator fields, and captions, use:

```yaml
value: "{{ auth.email }}"
url: "{{ BASE_URL }}/settings"
locator: { text: "{{ DEMO_WORKSPACE1 }}" }
```

Sources (later overrides earlier where applicable):

- `--env-file` / `.env`-style file (all keys)
- Shell `process.env` only for: auth env names, `BASE_URL`, and flat `{{ NAME }}` keys referenced in the scenario
- Captured variables during the run (see [URL capture](./url-capture.md))
- Built-in `auth.email` / `auth.password` from env names in `auth:` (or defaults `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD`)
- Nested keys: `{{ auth.email }}`

Prefer putting secrets and demo-specific values in `--env-file` rather than relying on the ambient shell environment.

`BASE_URL` from the env file overrides scenario `base_url` unless `--base-url` is passed (CLI wins).

**Regex locators are not interpolated** — see [Locators](./locators.md).

## Template functions

`[fnName:"arg"]` in supported string fields. Currently used in `video.filename`:

| Syntax | Description |
|--------|-------------|
| `[date:"FORMAT"]` | Current local date/time |

Tokens: `YYYY`, `MM`, `DD`, `HH`, `mm`.

```yaml
video:
  enabled: true
  dir: output/videos
  filename: demo-[date:"YYYY-MM-DD-HHmm"].mp4
```

Produces e.g. `demo-2026-04-01-1432.mp4`.

Implemented in `src/templates.ts`.
