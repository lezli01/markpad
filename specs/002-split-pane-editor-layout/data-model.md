# Phase 1 — Data Model: Split-Pane Editor Layout Foundation

The foundation has a deliberately small data model: one in-memory document and one workspace shell. Persistence, multiple documents, tabs, and project-level state are out of scope (see `spec.md` Assumptions and `research.md` §7).

## Entities

### Document

Represents the markdown content the user is editing in the current window/session.

| Field | Type | Source | Notes |
|---|---|---|---|
| `text` | `string` | React state in `App.tsx` (or `Workspace.tsx` — choose one owner) | The full markdown source. Initialized from `starterContent` on mount. |

**Validation rules**:
- `text` is always a `string` (never `null` / `undefined`). Empty string is valid (FR shows a clearly empty preview state).
- No length cap is enforced. Performance budget is documented per SC-002 for documents up to 10 000 characters.

**State transitions**:

```text
              initial mount
                   │
                   ▼
           text = starterContent
                   │
       editor change (user types)
                   │
                   ▼
           text = <new editor value>
                   │
       cleared by user (select-all + delete)
                   │
                   ▼
                text = ""
```

No transitions beyond user edits exist in this foundation (no load, no save, no undo at the Document level — undo is internal to CodeMirror's history).

### Workspace (UI-only entity)

The Workspace is not a persisted entity; it is a UI composition that holds the two panes. Listed here for clarity because the spec names it.

| Field | Type | Notes |
|---|---|---|
| `document` | `Document` (via state) | The single document instance for this session. |
| `layoutMode` | derived from CSS | `row` ≥ 768 px viewport, `column` below. Not stored in JS; expressed via Tailwind responsive variants. |

## Relationships

```text
App ──owns──▶ Document.text  (useState)
  │
  └──renders──▶ Workspace
                  ├──renders──▶ Editor (value=text, onChange=setText)
                  └──renders──▶ Preview (markdown=text)
```

Single-direction data flow: editor changes update `text`; preview consumes `text` and renders sanitized HTML. There is no derived/cached state; the preview computes from `text` each render (memoizable later if profiling shows a hot spot).

## Non-entities (explicit)

These are NOT in the data model for this foundation and should not be introduced silently in the tasks phase:

- **File**, **Workspace metadata**, **Tab**, **Theme preference**, **User settings**, **History**, **Selection** (selection lives inside CodeMirror's internal state).
- No `id`, `createdAt`, `updatedAt` fields — the document is anonymous and ephemeral.
