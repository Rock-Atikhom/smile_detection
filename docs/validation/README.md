# Validation

Web delivery is validated from the repository root with formatting, ESLint, referenced TypeScript
projects, Vitest, a production build, and Playwright against the built output under production
headers. Browser evidence covers 390x844, 844x390, 768x1024, and 1440x900. The Python reference
retains its locked 38-test, Ruff, and strict mypy gates.

Real Cloudflare preview and response-header evidence remains an owner-run acceptance step until the
project and credentials are configured.
