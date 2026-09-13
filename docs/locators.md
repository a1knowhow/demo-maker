---
title: Locators
nav_order: 6
---

{% raw %}
# Locators

Purpose: How to target UI elements in YAML (`locator:`). Prefer accessibility over CSS.

## Locator kinds

Each `locator:` object uses **exactly one** shape:

| Kind | YAML shape | Playwright | When to use |
|------|------------|------------|-------------|
| **role** | `{ role: button, name: Submit }` | `getByRole` | Buttons, links, headings, dialogs, comboboxes |
| **label** | `{ label: Email address }` | `getByLabel` | Fields with `<label>` or `aria-label` |
| **text** | `{ text: Acme Corp }` | `getByText` | Visible copy (substring); plain string only |
| **placeholder** | `{ placeholder: Search… }` | `getByPlaceholder` | Inputs by placeholder |
| **title** | `{ title: Close dialog }` | `getByTitle` | `title` attribute |
| **selector** | `{ selector: "#id" }` | `page.locator` | **Last resort** CSS |

Common roles: `button`, `textbox`, `link`, `heading`, `main`, `dialog`, `combobox`, `menuitem`, `checkbox`, `option`.

## Matching rules

- **Role + string `name`** — **exact** accessible name (`exact: true`)
- **Role + regex `name`** — `/Sign in/i` for case-insensitive / partial
- **`label`** — string or regex
- **`text`** — substring match; **no** regex on `text` (use `role`+regex or `selector: 'text=/…/i'` as last resort)
- **`settle_until: { text: "…" }`** — **exact** text (unlike step `locator: { text }`)

## Regex in YAML

Write JS-style regex as strings the parser understands:

```yaml
locator: { role: button, name: /Sign in/i }
locator: { label: /email address/i }
```

Supported flags: `g`, `i`, `m`, `s`, `u`, `y`.

**`{{ variables }}` do not work inside regex.** `/{{ DEMO_NAME }}/i` is literal. Use string fields:

```yaml
locator: { text: "{{ DEMO_NAME }}" }
locator: { role: link, name: "{{ DEMO_NAME }}" }
```

## Variables in locators

`{{ VAR }}` resolves at **run time** for string fields only (`text`, string `name`/`label`/`placeholder`/`title`/`selector`).

## Prefer stable kinds

`label` / `role`+`name` > `text` > `placeholder` > `selector`

## Examples

```yaml
# Login button
- action: click
  locator: { role: button, name: /Sign in/i }

# Form field
- action: type
  locator: { label: Email }
  value: "{{ auth.email }}"

# List row by visible name
- action: click
  locator: { text: "{{ DEMO_WORKSPACE1 }}" }

# Search then pick option
- action: type
  locator: { placeholder: Search… }
  value: Acme
- action: click
  locator: { role: option, name: /Acme/i }

# File upload (often no a11y hook)
- action: type
  locator: { selector: 'input[type="file"]' }
  value: /absolute/path/to/file.pdf
```

## Anti-patterns

```yaml
# wrong: "text" is not an ARIA role; {{ }} inside /…/i is literal
locator:
  role: text
  name: /{{ DEMO_NAME }}/i

# right
locator:
  text: "{{ DEMO_NAME }}"
```

## When a step fails

1. Note step number and Playwright error (`not found`, `strict mode violation`)
2. Isolate: `--end-step=N-1 --pause-at-end` and inspect Accessibility tree
3. Fix locator or add unique `aria-label` in the app
4. Or re-record a segment (`demo-maker record --continue-from …`) and transplant locators only

| Problem | Fix |
|---------|-----|
| Button renamed | Update `name` or `/partial/i` |
| Strict mode (2+ matches) | Exact name, unique `aria-label`, tighter regex |
| Custom editor (no role) | Add `aria-label` → `{ label: … }` or `{ role: textbox, name: … }` |
| Dynamic row | `{ text: "{{ VAR }}" }` |
| Recorder wrote `(recorded)` | Fix a11y; re-record or hand-write |

## Accessibility tip (for app authors)

Add unique `aria-label` on inputs, editors, and buttons. In loops, suffix with index or entity name so each instance is uniquely addressable. Dialogs need `aria-label` or `aria-labelledby` on the root.

## Recorder mapping

When recording/importing, priority is roughly: `aria-label`/`label=` → Playwright `getBy*` code → internal selector parse → fallback `text` or `(recorded)`.

See [Recording](./recording.md) and [Repairing scenarios](./repairing-scenarios.md).
{% endraw %}
