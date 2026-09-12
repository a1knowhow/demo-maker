# Security Policy

## Supported versions

Security fixes are applied to the latest release on the default branch (`main`). Older versions are not patched.

## Runtime capabilities

demo-maker is a CLI that runs only when invoked (there are **no** `preinstall` / `install` / `postinstall` scripts). When you run it, it may:

- Drive a browser via Playwright (network access to the URLs in your scenarios)
- Read named auth env vars or an `--env-file` for login steps
- Substitute `{{ placeholders }}` from that env file, scenario-referenced env keys, and `BASE_URL` (it does **not** copy the entire process environment into templates)
- Spawn `ffmpeg` on your `PATH` for video processing
- Read/write scenario files and video output on the local filesystem

Install Playwright browsers separately (`npx playwright install chromium`); this package does not download browsers at install time.

## Reporting a vulnerability

**Do not open a public GitHub issue** for security vulnerabilities.

Please report privately using [GitHub private vulnerability reporting](https://github.com/a1knowhow/demo-maker/security/advisories/new).

Include:

- Affected version / commit
- Description and impact
- Steps to reproduce (PoC welcome)

We aim to acknowledge reports within **7 days** and share a remediation plan when we confirm the issue. Coordinated disclosure is preferred (typical window: up to 90 days).

Thank you for helping keep demo-maker and its users safe.
