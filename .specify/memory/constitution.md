<!--
Sync Impact Report
==================
Version change: (uninitialized template) → 1.0.0 (initial ratification)
Modified principles: N/A — initial ratification
Added sections:
  - Core Principles I–IX (Simplicity First; Cross-Platform Desktop Support;
    Spec-Driven Development; Small, Reviewable Changes; AI-Assisted but
    Human-Owned; Local-First & Private by Default; Safe Markdown Rendering;
    Contributor-Friendly Open Source; Quality Gates)
  - Technology & Architecture Constraints
  - Development Workflow & Quality Gates
  - Governance
Removed sections: none (previous file was an unfilled template)
Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check section
    already defers to this file via a generic placeholder; no edit needed
  - ✅ .specify/templates/spec-template.md — no principle-specific edits
  - ✅ .specify/templates/tasks-template.md — no principle-specific edits
  - ✅ README.md — already aligned (goals match Principles I, II, III, V)
  - ✅ docs/architecture.md — already aligned (state-management rule matches
    Architecture Constraints)
  - ✅ CLAUDE.md — already aligned with Principles I, III, IV
Follow-up TODOs: none
-->

# markpad Constitution

markpad (Markdown editor with live preview) is a beginner-friendly, cross-platform
desktop Markdown viewer and editor for Windows, Linux, and macOS. This
constitution defines the non-negotiable engineering principles, workflow, and
governance that all contributors and AI assistants MUST follow.

## Core Principles

### I. Simplicity First

Every feature, abstraction, and dependency MUST justify its complexity against
the simpler alternative. Three similar lines beat a premature abstraction; one
screen of plain code beats a clever framework. Ship the boring version unless a
written reason exists to do otherwise.

**Rationale**: markpad is built by and for beginners. Simple code attracts
contributors, reduces bugs, and keeps the maintainer in control. Complexity
creep is the single largest threat to a small open-source project.

### II. Cross-Platform Desktop Support

markpad MUST build and run on Windows, Linux, and macOS from a single codebase.
Platform-specific code MUST be isolated behind clear abstractions and exercised
on each target before a release is cut.

**Rationale**: A Markdown editor that only works on one OS fragments the
audience and the contributor pool. Tauri 2 was chosen specifically to keep all
three targets viable from day one.

### III. Spec-Driven Development

Every meaningful feature MUST begin with a written specification under `specs/`
before implementation starts. Specs define user-visible behavior and acceptance
criteria; plans translate specs into technical steps. Code without an upstream
spec is rejected unless it is a trivial fix, chore, or documentation tweak.

**Rationale**: Specs force clarity, enable AI-assisted implementation, and make
review tractable. They also serve as living documentation for newcomers.

### IV. Small, Reviewable Changes

Pull requests MUST be small enough to review in one sitting. Large features
MUST be decomposed into incremental, individually mergeable PRs. Mixing
unrelated changes in a single PR is prohibited.

**Rationale**: Small PRs land faster, attract better review attention, and
bisect cleanly when bugs appear later.

### V. AI-Assisted but Human-Owned

AI tools (Claude, Copilot, etc.) MAY draft code, specs, plans, and reviews. A
human maintainer MUST read, understand, and approve every line before it lands
on `master`. "The AI wrote it" is never a defense for code the maintainer
cannot explain.

**Rationale**: AI accelerates the boring parts but cannot be accountable.
Human ownership is what keeps the project coherent and the maintainer learning.

### VI. Local-First & Private by Default

markpad MUST operate fully offline against local files. Network access,
telemetry, cloud sync, and account systems MUST NOT be added without an
explicit spec, a clear user-visible opt-in, and a security review. The default
install MUST send zero data anywhere.

**Rationale**: Markdown notes are often personal. Local-first is faster, more
private, and removes entire classes of risk and external dependency.

### VII. Safe Markdown Rendering

All rendered Markdown HTML MUST be sanitized before being inserted into the
DOM. Raw HTML embedded in user documents MUST be treated as untrusted input.
Use of `dangerouslySetInnerHTML` (or equivalent) without an active sanitizer
in the same code path is prohibited.

**Rationale**: The preview executes in the same renderer as the app. An
unsanitized link, image, or `<script>` is a direct path to XSS inside a
desktop app that has file-system access.

### VIII. Contributor-Friendly Open Source

The project MUST stay approachable to first-time contributors. This means a
working `README.md`, a one-command setup, a `CONTRIBUTING.md` once outside
contributors arrive, descriptive issue labels (`good-first-issue` where
appropriate), and code reviews that teach rather than gatekeep.

**Rationale**: markpad is a learning project as much as a tool. Friction at the
entry point kills the contributor pipeline before it starts.

### IX. Quality Gates: Tests, Lint, Format, CI

Every PR MUST pass: TypeScript type checks, ESLint, Prettier, and any defined
test suites — all enforced by CI. Merges to `master` are blocked on a green CI
run. Failing gates MUST be fixed at the root, never bypassed with
`--no-verify`, skip directives, or disabled rules without justification in the
PR.

**Rationale**: Automation is cheaper than discipline. Gates catch what
reviewers miss and let the maintainer trust the `master` branch.

## Technology & Architecture Constraints

**Approved stack** (additions or substitutions require a constitution
amendment):

- Desktop runtime: Tauri 2 (Rust backend, system webview frontend)
- UI: React + TypeScript
- Build tool: Vite
- Editor: CodeMirror 6
- Markdown parser: markdown-it
- Styling: Tailwind CSS

**Architecture rules**:

- The Rust/Tauri backend MUST stay minimal. Logic that can live in TypeScript
  SHOULD live in TypeScript until a concrete need (performance, native API,
  security boundary) justifies moving it to Rust.
- React components MUST be small and single-purpose. A component that exceeds
  roughly 150 lines or owns more than one concern MUST be split.
- Global state libraries (Redux, Zustand, Jotai, MobX, etc.) MUST NOT be
  introduced until local state and React context have demonstrably failed.
  The decision MUST be documented in a plan before the dependency is added.
- New runtime dependencies (npm or Cargo) MUST be justified in the PR
  description: what it does, why a built-in or smaller alternative is
  insufficient, and a quick look at its maintenance and security posture.
- All Markdown-to-HTML output MUST pass through a sanitizer (e.g., DOMPurify
  or equivalent) before reaching the DOM.
- Features that require network access, telemetry, or cloud services MUST go
  through a dedicated spec and ship off by default behind a user opt-in.

## Development Workflow & Quality Gates

**Workflow** (every meaningful change):

1. Open a GitHub Issue describing the change and its acceptance criteria.
2. Create a feature branch (`###-short-name`) via `/speckit-git-feature`.
3. Write the spec with `/speckit-specify`; optionally clarify with
   `/speckit-clarify`.
4. Produce the technical plan with `/speckit-plan`.
5. Break the plan into tasks with `/speckit-tasks`.
6. Implement in small commits, opening a PR even when working solo.
7. Merge to `master` only after CI is green and a human review has occurred.
   Solo work counts when the maintainer self-reviews with fresh eyes and
   leaves a brief review note on the PR.

**Quality gates enforced by CI**:

- TypeScript compiles with no errors (`tsc --noEmit`).
- ESLint passes with zero errors.
- Prettier reports no formatting drift.
- Defined test suites pass.
- The app builds successfully for Windows, Linux, and macOS targets.

**Out-of-band requirements**:

- Security-relevant changes (rendering, file I/O, Tauri IPC commands) MUST be
  reviewed explicitly against Principles VI and VII before merge.
- Any newly added dependency MUST have its `npm audit` or `cargo audit` result
  noted in the PR description.

## Governance

This constitution supersedes ad-hoc conventions and PR-time opinions. When
this document and another guideline disagree, this document wins until
amended.

**Amendments**:

- Any change to a principle, constraint, or governance rule MUST land via a
  PR that updates this file.
- The PR MUST include an updated Sync Impact Report (the comment block at the
  top of this file) and update any affected templates or docs in the same PR.
- Version bumps follow semantic versioning of the constitution itself:
  - **MAJOR**: a principle is removed, renumbered, or materially redefined in
    a way that invalidates prior practice.
  - **MINOR**: a principle or section is added, or guidance is materially
    expanded.
  - **PATCH**: clarifications, wording fixes, or non-semantic refinements.

**Compliance**:

- Every PR review MUST verify the change does not violate any principle, or
  include explicit justification in a "Complexity Tracking" or "Constitution
  Exception" section of the plan.
- The maintainer SHOULD re-read this constitution at least once per quarter
  and prune anything that has gone stale.
- Project-level runtime guidance for AI assistants lives in `CLAUDE.md` and
  MUST stay consistent with this constitution; on conflict, this file wins
  and `CLAUDE.md` MUST be updated.

**Version**: 1.0.0 | **Ratified**: 2026-05-20 | **Last Amended**: 2026-05-20
