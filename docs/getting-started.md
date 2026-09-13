---
title: Getting started
nav_order: 2
---

# Getting started

Purpose: Step-by-step from install to a first recorded MP4.

## Step 1 — Install prerequisites

**Goal:** Node, Chromium, and ffmpeg available.

```bash
node -v          # need 20+
brew install ffmpeg   # macOS; or apt/winget on Linux/Windows
```

**Clone and install** (from the repo root):

```bash
npm install
npx playwright install chromium
```

Or as a dependency in your project:

```bash
npm install -D @a1knowhow/demo-maker
npx playwright install chromium
```

**Expected:** `npx demo-maker --help` prints usage.

**Common failure:** `ffmpeg: command not found` — install ffmpeg before using `.mp4`, `cut_video`, or background audio.

---

## Step 2 — Run the smoke example

**Goal:** Prove the CLI drives a browser.

```bash
npx demo-maker run examples/smoke.yaml --headless --fast
```

**Expected:** Scenario completes successfully (opens example.com, asserts “Example Domain”).

**Common failure:** Playwright browser missing → re-run `npx playwright install chromium`.

For a public docs tour (getting-started → actions → locators):

```bash
npx demo-maker run examples/demo1-introduction.yaml --headless --fast
```

For a richer GitHub Actions UI walkthrough:

```bash
npx demo-maker run examples/demo2-github-actions.yaml --headless --fast
```

---

## Step 3 — Point at your app

**Goal:** A minimal scenario against your product.

1. Copy `examples/smoke.yaml` to e.g. `scenarios/my-app.yaml`.
2. Set `base_url` to your app (e.g. `http://localhost:3000`).
3. Replace steps with `navigate` / `click` / `type` / `expect_visible` for a short happy path.

```yaml
name: my-app-smoke
description: First walkthrough
base_url: http://localhost:3000/
steps:
  - action: navigate
    url: "/"
  - action: expect_visible
    locator: { role: heading, name: /Welcome/i }
  - action: wait
    timeout_ms: 1500
```

```bash
npx demo-maker run scenarios/my-app.yaml --headless --fast
```

**Expected:** Steps pass against your running app.

**Common failure:** Locator not found → see [Locators](./locators.md) and [Repairing scenarios](./repairing-scenarios.md). Prefer `role`/`label`/`text` over CSS.

---

## Step 4 — Env file and auth (when needed)

**Goal:** Credentials and `{{ VAR }}` without hardcoding secrets in YAML.

Create `scenarios/u2.env` (do not commit secrets):

```dotenv
E2E_TEST_USER_EMAIL=you@example.com
E2E_TEST_USER_PASSWORD=secret
BASE_URL=http://localhost:3000/
DEMO_WORKSPACE1=Acme Corp
```

If the scenario includes an `auth:` block, those env vars are required. Otherwise empty auth is allowed (as in smoke).

```yaml
auth:
  email_env: E2E_TEST_USER_EMAIL
  password_env: E2E_TEST_USER_PASSWORD
steps:
  - action: type
    locator: { role: textbox, name: /email/i }
    value: "{{ auth.email }}"
```

```bash
npx demo-maker run scenarios/login.yaml --env-file scenarios/u2.env --fast
```

**Save session** after login for later runs:

```bash
npx demo-maker run scenarios/login.yaml --env-file scenarios/u2.env \
  --save-storage-state=scenarios/session.json

npx demo-maker run scenarios/app.yaml --env-file scenarios/u2.env \
  --storage-state=scenarios/session.json --fast
```

---

## Step 5 — Record a video (MP4)

**Goal:** Polished output for demos.

```yaml
video:
  enabled: true
  dir: output/videos
  filename: demo-[date:"YYYY-MM-DD-HHmm"].mp4
  size: { width: 1920, height: 1080 }
  viewport: { width: 1440, height: 810 }   # optional; fit laptop screen when headed
```

```bash
npx demo-maker run scenarios/my-app.yaml --env-file scenarios/u2.env
```

**Expected:** MP4 under `output/videos/` plus a sibling `*.timing.json`.

**Common failure:** `.mp4` without ffmpeg → runner keeps WebM and warns. Install ffmpeg and re-run.

Details: [Video and pacing](./video-and-pacing.md).

---

## Step 6 — Record interactions instead of writing YAML by hand

**Goal:** Capture real clicks as steps.

```bash
demo-maker record \
  --save-to scenarios/recorded.yaml \
  --url http://localhost:3000/ \
  --env-file scenarios/u2.env
```

Interact in the browser, then **Ctrl+C** to save. Edit captions and locators, then `npx demo-maker run`.

Continue from an existing prefix (e.g. login):

```bash
demo-maker record \
  --continue-from scenarios/01.login.yaml \
  --save-to scenarios/recorded-segment.yaml \
  --fast --env-file scenarios/u2.env
```

Details: [Recording](./recording.md).

---

## Step 7 — Reuse fragments with imports

**Goal:** Don’t copy-paste login into every scenario.

```yaml
# scenarios/full-demo.yaml
name: full-demo
base_url: http://localhost:3000/
steps:
  - import: 01.login.yaml
  - action: click
    locator: { role: link, name: Dashboard }
  - import: fragments/create-item.yaml
```

Details: [Imports and fragments](./imports-and-fragments.md).

---

## Step 8 — YouTube chapters

**Goal:** Paste chapter timestamps into a video description.

```bash
demo-maker export-chapters output/videos
# or: demo-maker export-chapters output/videos/demo-….timing.json
```

Use `action: log` with `── Scene N: …` markers and/or step `caption:` for chapter labels.

---

## Next reading

- Full action list: [Actions](./actions.md)
- Locator guide: [Locators](./locators.md)
- After UI breaks demos: [Repairing scenarios](./repairing-scenarios.md)
- All flags: [CLI](./cli.md)
