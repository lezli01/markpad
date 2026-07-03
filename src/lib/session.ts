// Single chokepoint for session persistence (load/save the recents list + active state).
// The on-disk session.json is owned by the Rust side (src-tauri/src/session.rs); this module
// is the only TS importer of `invoke("load_session" | "save_session")`. The schema mirrors
// the Rust SessionRecord struct exactly (snake_case fields, version=2).
//
// Schema v2 (recents redesign): items replace tabs. A clean file item stores only its path;
// modified and untitled items also carry their unsaved buffer contents (text/saved_text) so
// drafts survive a restart. The Rust side migrates legacy v1 records transparently, so this
// module always receives a v2 record.

import { invoke } from "@tauri-apps/api/core";

export type SessionItem = {
  kind: "file" | "untitled";
  /** Absolute path for file items; null for untitled drafts. */
  path: string | null;
  /** Display name (basename for files, "Untitled-N" for drafts). */
  name: string;
  /** Whether the item had unsaved changes when persisted. */
  dirty: boolean;
  /** Unsaved buffer text — present for retained (untitled/dirty) items, else null. */
  text: string | null;
  /** Disk baseline text captured alongside `text` for accurate dirty tracking. */
  saved_text: string | null;
};

export type SessionRecord = {
  version: 2;
  items: SessionItem[];
  active_index: number | null;
};

function emptySession(): SessionRecord {
  return { version: 2, items: [], active_index: null };
}

export async function loadSession(): Promise<SessionRecord> {
  try {
    const record = await invoke<SessionRecord>("load_session");
    if (record && record.version === 2 && Array.isArray(record.items)) {
      return record;
    }
    return emptySession();
  } catch (err) {
    console.warn("load_session failed; treating as empty session:", err);
    return emptySession();
  }
}

export async function saveSession(record: SessionRecord): Promise<void> {
  try {
    await invoke<void>("save_session", { record });
  } catch (err) {
    console.warn("save_session failed; session not persisted this round:", err);
  }
}
