# AI Development Rules for markpad

## Project

markpad stands for Markdown editor with live preview.

## Principles

- Prefer simple, readable code.
- Keep features small and reviewable.
- Avoid premature abstractions.
- Do not add dependencies without justification.
- Every meaningful feature should begin with an issue or spec.
- Favor contributor-friendly architecture.

## Stack

- Tauri 2
- React
- TypeScript
- Vite
- CodeMirror 6
- markdown-it
- Tailwind CSS

## Development Workflow

1. Create an issue.
2. Write acceptance criteria.
3. Ask AI for an implementation plan.
4. Implement in small commits.
5. Open a PR, even when working solo.
6. Merge only after CI passes.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
[specs/007-file-association-single-instance/plan.md](specs/007-file-association-single-instance/plan.md)
<!-- SPECKIT END -->
