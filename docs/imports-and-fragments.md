---
title: Imports and fragments
nav_order: 8
---

{% raw %}
# Imports and fragments

Purpose: Compose reusable YAML without duplicating steps.

## Two forms

1. **Top-level `imports:`** — paths relative to the entry file; their steps run **first**, in order, then local `steps`.
2. **Step-level `- import: path.yaml`** — expanded **in place** so you can interleave fragments.

Nested imports are allowed. Circular imports error.

**Metadata:** Only the **entry** file’s `name`, `base_url`, `video`, pacing, `auth`, etc. apply. Imported files contribute steps only.

Paths resolve relative to the YAML file that contains the reference.

## Fragment example

```yaml
# fragments/login.yaml
name: login
base_url: http://localhost:3000/
steps:
  - action: navigate
    url: /login
  - action: type
    locator: { role: textbox, name: /email/i }
    value: "{{ auth.email }}"
  - action: type
    locator: { role: textbox, name: /password/i }
    value: "{{ auth.password }}"
  - action: click
    locator: { role: button, name: /Sign in/i }
```

## Step-level composition

```yaml
name: full-demo
base_url: http://localhost:3000/
steps:
  - import: fragments/login.yaml
  - action: click
    locator: { role: link, name: Dashboard }
  - import: fragments/create-item.yaml
  - action: wait
    timeout_ms: 2000
```

Order: login steps → click Dashboard → create-item steps → wait.

## Top-level imports only

```yaml
name: full-demo
base_url: http://localhost:3000/
imports:
  - fragments/login.yaml
  - fragments/create-item.yaml
steps:
  - action: click
    locator: { role: link, name: folder }
```

Order: login → create-item → click folder.

## Continue-from recordings

When you `demo-maker record --continue-from 01.login.yaml --save-to recorded.yaml`, the saved file typically has:

```yaml
name: recorded-…
imports:
  - 01.login.yaml
steps:
  # only newly recorded steps
```

See [Recording](./recording.md).
{% endraw %}
