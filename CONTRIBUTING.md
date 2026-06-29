# Contributing to markpad

Thanks for helping improve markpad, the Markdown editor with live preview.

markpad is early-stage and intentionally contributor-friendly: small issues, clear acceptance criteria, and reviewable pull requests are preferred over large surprise changes.

## Ways to Contribute

- Report bugs with clear reproduction steps.
- Propose features through an issue before implementation.
- Improve documentation, examples, and setup notes.
- Pick up issues labeled `good first issue` or `help wanted`.
- Review pull requests with a focus on behavior, clarity, and test coverage.

## Development Setup

Prerequisites:

- Node.js LTS
- npm
- Rust and Cargo
- Tauri 2 platform prerequisites for your operating system

Install dependencies:

```sh
npm ci
```

Run the web development server:

```sh
npm run dev
```

Run the Tauri desktop app:

```sh
npm run tauri dev
```

## Project Workflow

1. Open or claim an issue.
2. Add acceptance criteria before implementation starts.
3. Keep the change scoped to the issue.
4. Run the relevant checks locally.
5. Open a pull request and link the issue with `Closes #issue-number`.

For features, prefer a short spec or implementation plan when the behavior is not obvious. This keeps design decisions visible and makes review easier.

## Quality Checks

Run these before opening a pull request when possible:

```sh
npm run lint
npm run build
```

For Rust/Tauri changes, also run from `src-tauri/`:

```sh
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo check --all-targets --all-features
```

If you cannot run a check locally, say so in the pull request test plan.

## Pull Requests

Pull requests should:

- Link an issue or spec.
- Explain what changed and why.
- Include a test plan.
- Include screenshots or recordings for visible UI changes.
- Avoid unrelated refactors.
- Avoid new dependencies unless the issue or PR explains the need.

Maintainers may ask for smaller follow-up issues instead of expanding a pull request.

## Commit Style

Use conventional commit wording for PR titles and commits, such as:

- `feat: add editor persistence`
- `fix: prevent unsafe preview markup`
- `docs: document tauri setup`
- `chore: update ci configuration`

This keeps release notes and automated checks predictable.

