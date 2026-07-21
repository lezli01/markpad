use serde::{Deserialize, Serialize};
use tauri::Manager;

// Session schema v2 (Feature: recents redesign).
//
// The left "recents" list persists up to 50 most-recently-opened items. Unlike
// v1 (which stored only paths and reloaded everything from disk), v2 also
// carries the unsaved buffer contents of modified and untitled items so drafts
// survive a restart. Clean file items still store only their path and are
// reloaded lazily from disk on the TS side.
//
//   kind == "file"     -> `path` is Some; a clean file omits text/saved_text.
//   kind == "untitled" -> `path` is None; text/saved_text carry the draft.
//
// v1 records (`{version:1, tabs:[{path}], active_index}`) are migrated on load
// so an upgrade doesn't lose the user's open files.

#[derive(Serialize, Deserialize)]
pub struct SessionRecord {
    pub version: u32,
    pub items: Vec<SessionItem>,
    pub active_index: Option<usize>,
}

#[derive(Serialize, Deserialize)]
pub struct SessionItem {
    pub kind: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub dirty: bool,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub saved_text: Option<String>,
    /// Manual language override ("markdown" | "json"); None when the language
    /// derives from the path. Defaults keep pre-JSON-support records loadable.
    #[serde(default)]
    pub language: Option<String>,
}

// --- v1 (legacy) shape, kept only to migrate old session files. ---

#[derive(Deserialize)]
struct SessionRecordV1 {
    version: u32,
    #[serde(default)]
    tabs: Vec<SessionTabEntryV1>,
    #[serde(default)]
    active_index: Option<usize>,
}

#[derive(Deserialize)]
struct SessionTabEntryV1 {
    path: String,
}

fn empty_session() -> SessionRecord {
    SessionRecord {
        version: 2,
        items: Vec::new(),
        active_index: None,
    }
}

fn basename(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    match normalized.rsplit('/').next() {
        Some(name) if !name.is_empty() => name.to_string(),
        _ => normalized,
    }
}

fn migrate_v1(v1: SessionRecordV1) -> SessionRecord {
    let items = v1
        .tabs
        .into_iter()
        .map(|tab| SessionItem {
            name: basename(&tab.path),
            path: Some(tab.path),
            kind: "file".to_string(),
            dirty: false,
            text: None,
            saved_text: None,
            language: None,
        })
        .collect();
    SessionRecord {
        version: 2,
        items,
        active_index: v1.active_index,
    }
}

fn parse_session(content: &str) -> SessionRecord {
    if let Ok(record) = serde_json::from_str::<SessionRecord>(content) {
        if record.version == 2 {
            return record;
        }
    }
    if let Ok(v1) = serde_json::from_str::<SessionRecordV1>(content) {
        if v1.version == 1 {
            return migrate_v1(v1);
        }
    }
    empty_session()
}

#[tauri::command]
pub async fn load_session(app: tauri::AppHandle) -> Result<SessionRecord, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app_data_dir: {err}"))?;
    let path = dir.join("session.json");
    let content = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Ok(empty_session()),
    };
    Ok(parse_session(&content))
}

#[tauri::command]
pub async fn save_session(app: tauri::AppHandle, record: SessionRecord) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app_data_dir: {err}"))?;
    std::fs::create_dir_all(&dir).map_err(|err| format!("failed to create app_data_dir: {err}"))?;
    let serialized = serde_json::to_string_pretty(&record)
        .map_err(|err| format!("failed to serialize session: {err}"))?;
    let tmp = dir.join("session.json.tmp");
    let final_path = dir.join("session.json");
    std::fs::write(&tmp, serialized)
        .map_err(|err| format!("failed to write session.json.tmp: {err}"))?;
    std::fs::rename(&tmp, &final_path)
        .map_err(|err| format!("failed to rename session.json.tmp: {err}"))?;
    Ok(())
}
