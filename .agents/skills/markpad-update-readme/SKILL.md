---
name: markpad-update-readme
description: Refresh and verify markpad's README.md before merging a pull request, especially when README.md, docs/images, user-visible features, screenshots, project commands, specs, or app UI behavior changed. Use this skill to check that the README is up to date, update screenshots/images and alt text, add newly shipped capabilities or missing documentation, prune stale claims, and reconcile the Features list with the current code and specs.
---

# markpad README Update

## Overview

Use this skill as a pre-merge README pass for markpad. The goal is a README that accurately reflects the product users can run today, with current screenshots, correct commands, and a complete but concise Features list.

## Workflow

1. Establish the PR scope.
   - Inspect the working tree and branch diff before editing: `git status --short`, `git diff --name-only`, and, when a base branch is known, `git diff --name-only <base>...HEAD`.
   - Focus on user-facing changes: UI behavior, commands, dependencies, Tauri permissions, storage/privacy behavior, screenshots, docs, specs, and shipped features.
   - Preserve unrelated user changes. Do not revert or restyle unrelated README sections just because they look imperfect.

2. Run the README audit helper.
   - From the repo root, run:

```sh
node .agents/skills/markpad-update-readme/scripts/readme-audit.mjs README.md
```

   - Use the report to find missing local images, current README headings, and the existing Features bullets. Treat it as a checklist, not as the source of truth.

3. Reconcile README content with the repo.
   - Read `README.md`, `package.json`, `src-tauri/tauri.conf.json`, and any changed files from the PR.
   - Read relevant specs under `specs/` when a feature has a spec. Prefer the implemented code over aspirational spec text when they disagree.
   - Use CodeGraph for structural questions about app capabilities or component flow when available; use `rg` for literal text searches.
   - Confirm the Quick start and Development checks commands match `package.json` and the Tauri/Rust project.
   - Confirm privacy and security claims still match the implementation.

4. Update features and status.
   - Keep `## Features` limited to capabilities that are implemented and available to users now.
   - Add newly shipped user-visible capabilities that are missing.
   - Remove or reword stale, planned, or partially true bullets.
   - Prefer concrete feature names and one-sentence descriptions. Avoid implementation details unless users need them to understand the capability.
   - Keep `## Status` honest about maturity and current working areas.

5. Refresh README images when the UI changed.
   - Verify every local image referenced from README exists and renders.
   - For app screenshots, run the app or frontend and capture the current UI. Prefer the Browser plugin/in-app browser for `npm run dev` screenshots; use Tauri only when native-shell behavior is important.
   - Update `docs/images/screenshot.png` or other README images in place when the visible UI, theme, feature set, or filename shown in the screenshot is stale.
   - Use meaningful alt text that describes the current UI state. Avoid decorative or marketing-style screenshots that hide the actual app.
   - If a screenshot cannot be refreshed in the current environment, leave the README text correct and report the screenshot as a remaining merge blocker or follow-up.

6. Edit README.md in place.
   - Keep the README compact and contributor-friendly: product summary, screenshot, status, features, stack, quick start, checks, layout, workflow, privacy/security/license.
   - Add a new section only when it helps a first-time user or contributor. Do not add changelog-style PR details.
   - Keep Markdown links relative for repo files and stable for external docs.
   - Update image paths and dimensions only when needed.

7. Verify before finishing.
   - Re-run the audit helper and ensure no local README images are missing.
   - Run `npm run lint` and `npm run build` when README changes were tied to source changes or screenshots. For docs-only README edits, run the audit helper at minimum.
   - Review `git diff -- README.md docs/images` and summarize what changed.
   - Finish with merge readiness: what was updated, what was verified, and any remaining README/image risk.

## Helper

`scripts/readme-audit.mjs` is a dependency-free Node script. It reports:

- README headings
- feature bullets under `## Features`
- Markdown and HTML image references
- missing local image files

Use `--json` for machine-readable output.
