# Security Policy

## Supported Versions

MILF is pre-1.0. Security fixes target the current `master` branch unless a release branch is explicitly documented later.

## Reporting a Vulnerability

Please do not open a public issue for suspected vulnerabilities.

Report security concerns privately by using GitHub's private vulnerability reporting for this repository when available, or by contacting the maintainer through the maintainer's GitHub profile.

Include:

- A clear description of the vulnerability.
- Steps to reproduce or a proof of concept, if safe to share.
- Affected versions, commit SHAs, or platforms.
- Any known impact or mitigation.

## Response Expectations

The maintainer will try to acknowledge valid reports within 7 days, then coordinate a fix and disclosure plan based on severity and project capacity.

## Security Principles

- Markdown rendering must be sanitized before insertion into the DOM.
- The app should stay local-first and avoid network access unless a feature explicitly requires it.
- Secrets and credentials must not be committed to the repository.

