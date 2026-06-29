# Quickstart — Manual Acceptance for OS File Association, Single Instance, and Session Restore

This document is the manual test plan for Feature 007. Each step is a small, observable check; each check is mapped to the spec's Functional Requirements (FR-NNN) and Success Criteria (SC-NNN). Run the **installed release build** for the file-association scenarios (dev builds don't register with the OS); use `npm run tauri dev` for the rest.

The test files referenced below — `notes.md`, `readme.md`, `meeting.md`, `daily.md` — are any small markdown files you have on hand. Use absolute paths in shells where noted.

---

## Setup

1. Pull the branch: `git checkout 007-file-association-single-instance && npm install`.
2. For file-association scenarios (Scenario A) you need an installed build: `npm run tauri build`, then install the produced bundle (Windows `.msi`/`.exe`, macOS `.dmg`/`.app`, Linux `.AppImage`/`.deb`). Set markpad as the default `.md` handler via your OS settings:
   - **Windows**: Settings → Apps → Default apps → Choose default by file type → `.md` → markpad.
   - **macOS**: Right-click a `.md` file in Finder → Get Info → Open With → markpad → Change All….
   - **Linux**: `xdg-mime default markpad.desktop text/markdown` (or your distro's equivalent).
3. For all other scenarios, the dev build (`npm run tauri dev`) is fine.
4. Have at least four small markdown files ready: `notes.md`, `readme.md`, `meeting.md`, `daily.md`. Each ≤ 100 KB.
5. Know where markpad's app-data dir is on your OS so you can inspect `session.json` if needed:
   - **Windows**: `%APPDATA%\dev.is-a.lezli01.markpad\session.json`
   - **macOS**: `~/Library/Application Support/dev.is-a.lezli01.markpad/session.json`
   - **Linux**: `${XDG_DATA_HOME:-~/.local/share}/dev.is-a.lezli01.markpad/session.json`
6. Delete the existing `session.json` (if any) so you can start from a clean state for Scenario D.

---

## Scenario A — User Story 1 (P1): open `.md` files via OS file association

Covers **FR-001 to FR-004**, **SC-001**, **SC-009**. **Requires installed release build.**

1. Confirm markpad is NOT running (close any open markpad windows).
2. In your OS file browser, double-click `notes.md`. **Expect**: markpad launches; a tab appears with the title `notes.md`; the editor and preview show the file's content; the tab is the active tab.  
   → FR-001, FR-002 (cold-start path), Story 1 AS-1, SC-001.
3. Close markpad. Rename a file on your desktop to one with spaces and non-ASCII characters: `My Étude — notes (final).md`. Double-click it. **Expect**: markpad launches with that exact name as the tab title; editor shows the file's content correctly.  
   → FR-004, Story 1 AS-2.
4. Right-click any `.md` file → "Open With" → markpad (if your OS lists markpad without it being the default). **Expect**: same behavior as a default double-click.  
   → Story 1 AS-3.
5. **First-time-user check**: ask someone who has never used markpad to set it as default and open a `.md` file. **Expect**: they succeed without external instructions in roughly 1 minute.  
   → SC-009.

---

## Scenario B — User Story 2 (P2): single instance + bring-to-front

Covers **FR-005 to FR-009**, **SC-002**, **SC-003**, **SC-007**.

### B1. Bare second invocation (no file)

6. Launch markpad (release build or `npm run tauri dev`). Open one file via the in-app Open control so you have a tab. Minimize the window.
7. From a shell, run `markpad` with no arguments (release build) OR run `npm run tauri dev` a second time (dev build — note: dev mode may not enforce single-instance; verify in release for the canonical test).  
   **Release-build expectation**: NO second window appears. The minimized markpad restores and comes to the foreground (raised above other windows, given input focus). The existing tab set is unchanged.  
   → FR-005, FR-007, FR-008, FR-009, Story 2 AS-1.
8. **Time it**: from running the second `markpad` command to seeing the existing window in the foreground, well under 500 ms.  
   → SC-007.

### B2. Second invocation WITH a file

9. With markpad still running and an existing tab (`notes.md`), run `markpad readme.md` from a shell. **Expect**: no second window. The existing markpad window comes to the foreground. A new tab for `readme.md` appears alongside `notes.md` and becomes active. The `notes.md` tab is preserved exactly (including any unsaved edits).  
   → FR-006, FR-007, FR-002 (existing-instance path), Story 2 AS-2, SC-002, SC-003.
10. Type a small change in `notes.md` (asterisk appears on its tab). Without saving, run `markpad meeting.md` from a shell. **Expect**: still no second window; `meeting.md` opens as a new tab and becomes active; `notes.md` retains its asterisk and content.  
    → FR-002 (existing tabs preserved), Story 2 AS-2.

### B3. Duplicate-file open against an already-open tab

11. With `notes.md`, `readme.md`, `meeting.md` open (per the previous steps), run `markpad notes.md` from a shell. **Expect**: no third tab is created. The existing `notes.md` tab becomes active. Its unsaved content (the asterisk and the text from step 10) is preserved — NOT reloaded from disk.  
    → FR-023 (Feature 006 dedup applied to OS-routed paths), Story 2 AS-3.

### B4. Rapid succession (macOS Finder, or rapid shell invocations)

12. Close all markpad windows. From the OS file browser (or rapid-fire shell invocations), open four files in quick succession (within 1-2 seconds): `notes.md`, `readme.md`, `meeting.md`, `daily.md`. **Expect**: all four end up as tabs; the LAST one (`daily.md`) is the active tab; no second window appeared at any point; no file is silently lost.  
    → FR-003 (most recently arrived = active), Story 2 AS-4.

### B5. macOS-specific check (only on macOS)

13. With markpad running, double-click a `.md` from Finder. macOS does NOT spawn a second process; the file arrives via `NSApplicationOpenURLs`. **Expect**: same behavior as a `markpad foo.md` shell invocation — file opens as a new tab in the existing window, window comes to front.  
    → FR-001 + FR-006 routed through `RunEvent::Opened`.

---

## Scenario C — User Story 3 (P3): positional CLI arguments

Covers **FR-010 to FR-013**, **SC-004**.

14. Close markpad. From a shell in some working directory `~/work`, run `markpad intro.md changelog.md`. **Expect**: markpad launches with two tabs in the supplied order; `changelog.md` is active.  
    → FR-010, FR-011 (cold-start path), Story 3 AS-1.
15. **Time it**: from running the command to seeing both tabs and an interactive editor, under 3 seconds.  
    → SC-004.
16. With markpad still running, from the same shell run `markpad ./drafts/x.md ../README.md`. **Expect**: both files open as new tabs in the existing window (no second window). Relative paths resolved against `~/work` (NOT against markpad's install dir).  
    → FR-010 (relative-path resolution), Story 3 AS-2, Story 3 AS-3.
17. From a shell, run `markpad nonexistent.md real-file.md`. **Expect**: `real-file.md` opens as a new tab; `nonexistent.md` is silently skipped (no error dialog, no orphan tab); `real-file.md` becomes the active tab.  
    → FR-012, Story 3 AS-4.
18. With markpad NOT running, run `markpad` with no arguments. **Expect**: markpad launches in the empty state (assuming no saved session — clear `session.json` first if needed) OR with the restored session (if `session.json` exists with valid entries) — either is correct, depending on whether you completed Scenario D. The absence of CLI args is not itself an error.  
    → Story 3 AS-5.

---

## Scenario D — User Story 4 (P4): session restore

Covers **FR-014 to FR-021**, **SC-005**, **SC-006**, **SC-008**, **SC-010**.

### D1. Round trip: open files, close markpad, relaunch, see them again

19. Close markpad and delete `session.json`. Launch markpad, open `notes.md`, `readme.md`, `meeting.md` via the in-app Open control. Switch to `readme.md` so it's the active tab. Close markpad.
20. Inspect `session.json` in the app-data dir. **Expect**: it exists; its content shows `{ "version": 1, "tabs": [{ "path": ".../notes.md" }, { "path": ".../readme.md" }, { "path": ".../meeting.md" }], "active_index": 1 }` (or the canonical paths and an `active_index` of `1` for `readme.md`).  
    → FR-014.
21. Launch markpad (bare `markpad`, or just click the app icon). **Expect**: the same three tabs appear in the same order; `readme.md` is the active tab.  
    → FR-013, FR-015, FR-017, Story 4 AS-1, SC-005 (size N=3), SC-006, SC-010.
22. **Time it**: from launch to interactive editor, under 3 seconds.  
    → SC-004 / SC-005 for the restore path.

### D2. Missing file silently dropped

23. Close markpad. Outside markpad, rename `meeting.md` to `meeting-archived.md` (or move it to a different folder). Launch markpad. **Expect**: two tabs appear (`notes.md`, `readme.md`); `meeting.md` is silently absent; no error dialog; no orphan tab.  
    → FR-016, Story 4 AS-2, SC-005 (missing files don't fail launch), SC-008.

### D3. Active file missing, others survive

24. Close markpad. Outside markpad, move `readme.md` (the active tab from step 21) to a different folder. Launch markpad. **Expect**: `notes.md` is the only tab; `readme.md` is absent; `notes.md` is active (the surviving neighbor per FR-017).  
    → FR-017, Story 4 AS-3, SC-006.

### D4. All saved files missing → empty state

25. Close markpad. Outside markpad, move both `notes.md` and the restored `readme.md` (if it came back via rename) to a different folder. Launch markpad. **Expect**: empty state — empty TabStrip band, empty editor, empty preview, Save disabled. No error dialog.  
    → FR-019, Story 4 AS-4.

### D5. First-ever launch (or after manual `session.json` delete)

26. Close markpad, delete `session.json`. Launch markpad. **Expect**: empty state, same as Feature 006's first-launch behavior.  
    → FR-018, Story 4 AS-5.

### D6. Corrupt `session.json` doesn't block launch

27. Close markpad. Overwrite `session.json` with garbage (e.g., `echo "not valid json" > session.json` / `Set-Content session.json "not valid json"`). Launch markpad. **Expect**: empty state; no error dialog; markpad launches normally.  
    → FR-020.
28. Open a file inside markpad (via the Open control). Close markpad. Re-inspect `session.json` — it's now a valid record with that one file. **Expect**: the corrupt file was silently overwritten by the next valid save.  
    → FR-020.

### D7. CLI args + saved session: arguments win the active pointer

29. Close markpad and ensure a valid `session.json` exists with `readme.md` as the active tab (per step 21). From a shell, run `markpad daily.md`. **Expect**: `notes.md`, `readme.md`, `meeting.md` (from session) AND `daily.md` (from CLI) all appear as tabs in that order; `daily.md` is the active tab (CLI args win the active pointer per FR-022).  
    → FR-013, FR-022, Story 4 AS-6.

### D8. Untitled tabs are not persisted

30. Close markpad, ensure `session.json` is valid. Launch markpad. Click New (or Ctrl/Cmd+N) to add an Untitled tab. Type some text. Switch to the Untitled tab so it's active. Close markpad.
31. Inspect `session.json`. **Expect**: only the file-backed tabs are listed; the Untitled tab is NOT in `tabs`; `active_index` is `null` (because the active tab at save was Untitled).  
    → FR-021, spec Assumption 4.
32. Launch markpad. **Expect**: the file-backed tabs restore (same as before the Untitled exercise); the first restored tab is active (the FR-017 fallback walk found no saved active, so it picks the first surviving tab).  
    → FR-017 (active fallback when saved active is null), Story 4 AS-1.

---

## Scenario E — edge cases and security

Covers the spec's **Edge Cases** section + carry-over checks from Features 002 / 003 / 006.

### E1. Path with spaces and non-ASCII

33. (Covered by Step 3 above — verify the file opens correctly via OS double-click.)

### E2. Mid-cold-start race (macOS Finder double-click of multiple files at app launch)

34. **macOS only**: close markpad. In Finder, select two `.md` files and double-click (or right-click → Open). macOS sends both URLs via `NSApplicationOpenURLs` during launch. **Expect**: both end up as tabs; the second one is active.  
    → FR-001 (cold-start buffer + drain), Story 2 AS-4 cold-start variant.

### E3. Already-open file via OS activation

35. (Covered by Step 11 — verify dedup against existing tabs.)

### E4. Many files in the saved session

36. Close markpad, populate `session.json` manually with 20 valid paths and `active_index: 0` (use existing `.md` files of varying size, including one ~100 KB). Launch markpad. **Expect**: all 20 tabs restore; the first is active; the workspace is interactive within 3 seconds; no individual slow file blocks the rest.  
    → SC-005 (size N=20).

### E5. Bring-to-front from minimized state

37. Launch markpad with one file open. Minimize the window. Double-click another `.md` file from the OS browser (release build with file association configured). **Expect**: markpad un-minimizes and comes to front; the new file appears as a tab and becomes active.  
    → FR-007.

### E6. Bring-to-front while window is on a different virtual desktop or monitor

38. **If your OS supports virtual desktops**: launch markpad on desktop 1, switch to desktop 2. From desktop 2, run `markpad foo.md`. **Expect**: per OS convention, either markpad jumps to desktop 2 OR your view jumps to desktop 1 where markpad is. Either is acceptable per spec Assumption 3 ("the spec does not promise specific behavior across virtual desktops beyond what the host OS exposes").

### E7. Sanitizer still works on OS-activated files

39. Create `xss.md` with content `<script>alert(1)</script>\n\n# Hello`. Save it. Double-click it from the OS browser (release build, file association configured) OR run `markpad xss.md`. **Expect**: the `<script>` tag does NOT execute; the preview renders the heading; the inline HTML is stripped by DOMPurify.  
    → Constitution Principle VII (Safe Markdown Rendering) regression check.

### E8. Re-opening an in-markpad tab via the in-app Open dialog (Feature 006 dedup still works)

40. With several tabs open, click the in-app Open control and pick a file that already has a tab. **Expect**: existing tab activates; no duplicate; no reload from disk (Feature 006 FR-011).

### E9. Saved session on removable drive that's offline

41. Close markpad. Edit `session.json` to include a path on a removable drive (e.g., `D:\notes.md` on Windows, `/Volumes/USB/notes.md` on macOS) when the drive is NOT mounted. Launch markpad. **Expect**: that path is silently skipped (treated as missing); other paths restore normally.  
    → FR-016.

### E10. Same file passed twice on CLI

42. Close markpad. Run `markpad foo.md foo.md`. **Expect**: one tab for `foo.md`; the second reference is treated as a re-focus of the same tab (no duplicate).  
    → FR-023 (Feature 006 dedup applied to CLI args).

### E11. Window-title still updates from session-restored active tab

43. After Scenario D's step 21 (session restored with `readme.md` active), look at the OS window title. **Expect**: it shows `readme.md — markpad` (Feature 003's `setWindowTitle` continues to fire on `activeTabId` change after restore).

### E12. Crash mid-save leaves the previous `session.json` intact

44. (Optional, harder to reproduce.) Launch markpad, open a file, then forcibly kill the process (Task Manager / `kill -9`) within a few milliseconds. Inspect `session.json`. **Expect**: it is either the empty default OR the previous valid state — never a half-file. The atomic temp+rename guarantees this.

---

## Scenario F — performance sanity

Covers SC-001, SC-004, SC-005, SC-007.

45. **Cold start with 10 saved tabs, all ~100 KB**: time from double-click on the app icon to interactive editor. **Expect**: under 3 seconds. Editor stays interactive throughout the restore.  
    → SC-001, SC-005.
46. **Hot dispatch latency**: from running `markpad foo.md` (second invocation) to seeing `foo.md` as the active tab AND the window in the foreground. **Expect**: under 500 ms in at least 95% of attempts (run 10 times).  
    → SC-007.
47. **Session save coalescing**: in dev mode, watch the console for `save_session` calls (or temporarily add a log line). Open 5 files in rapid succession. **Expect**: a single save fires ~300 ms after the last open, not five separate saves.  
    → Plan §8 (debounced save).

---

## Notes on platform coverage

- The **CLI args** path (Scenarios C, D7, E10) works the same on Windows / Linux / macOS — `std::env::args()` is portable.
- The **file association** path (Scenario A) requires the release build to register with the OS; dev mode does NOT register.
- The **`RunEvent::Opened`** path (Scenario B5, E2) is macOS-specific in practice — Windows and Linux deliver file activations via CLI args.
- The **single-instance plugin** works on all three OSes via the same Rust API; behavior is platform-uniform.
- **`bring_to_front`** behavior across virtual desktops, multi-monitor, focus-stealing-prevention varies by OS and by user settings; the spec does not promise specific behavior beyond what the OS exposes (spec Assumption 3).

If a step fails, capture: (a) the OS + version, (b) what you ran / clicked, (c) what you expected, (d) what happened, (e) the contents of `session.json` and the relevant console logs (Rust side: terminal where `npm run tauri dev` runs; Frontend side: webview devtools console).
