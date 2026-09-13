---
title: Repairing scenarios
nav_order: 11
---

# Repairing scenarios

Purpose: YAML is valid but fails at runtime after UI changes. This is a **runtime** smoke loop, not schema validation.

## 1. Detect drift

```bash
demo-maker check scenarios/02.create.yaml \
  --env-file scenarios/u2.env \
  --storage-state=scenarios/session.json
```

`check` = `run --fail-fast --fast`. Note the failing **step number** and Playwright message. Treat the browser + error as source of truth.

Optional failure screenshot:

```bash
demo-maker check scenarios/02.create.yaml \
  --env-file scenarios/u2.env \
  --debug-dir=output/demo-debug
```

## 2. Isolate

Replay only the prefix, then pause headed:

```bash
npx demo-maker run scenarios/02.create.yaml \
  --env-file scenarios/u2.env \
  --storage-state=scenarios/session.json \
  --fast --end-step=7 --pause-at-end
```

Inspect the Accessibility tree (role, name, label) for the next control.

## 3. Re-capture

```bash
demo-maker record \
  --continue-from scenarios/02.create.yaml \
  --end-step=7 \
  --save-to _repair/segment.yaml \
  --save-json _repair/segment.json \
  --fast --env-file scenarios/u2.env
```

Perform the corrected path, **Ctrl+C**. Do **not** blindly overwrite the canonical YAML — transplant changed `locator` values and steps; keep `caption`, `video`, pacing, and `metadata`.

## 4. Verify

```bash
demo-maker check scenarios/02.create.yaml \
  --env-file scenarios/u2.env \
  --storage-state=scenarios/session.json
```

Then re-run your full demo / project smoke targets if you have them.

## Flags used in the loop

| Flag | Purpose |
|------|---------|
| `--fail-fast` / `check` | Stop on first failure |
| `--end-step=N` | Run or replay only 1..N |
| `--pause-at-end` | Keep browser open |
| `--debug-dir=PATH` | PNG on failure |
| `--continue-from` | Replay then record |

See [CLI](./cli.md), [Locators](./locators.md), [Recording](./recording.md).

## Prefer fixing a11y

When locators break, prefer adding unique `aria-label` (and dialog names) in the app over brittle CSS. Then update YAML to `{ role, name }` / `{ label }`.
