use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde_json::json;
use tauri::{Emitter, Manager};

pub struct LaunchFilesState {
    pub pending: Mutex<Vec<PathBuf>>,
    pub frontend_ready: AtomicBool,
}

impl Default for LaunchFilesState {
    fn default() -> Self {
        Self {
            pending: Mutex::new(Vec::new()),
            frontend_ready: AtomicBool::new(false),
        }
    }
}

/// Strip Windows' `\\?\` UNC prefix that `std::fs::canonicalize` adds, so the
/// resulting path is consumable by frontends and IPC payloads. Leaves real UNC
/// network paths (`\\?\UNC\server\share`) untouched. Non-Windows targets pass
/// through unchanged.
pub fn strip_unc_prefix(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let s = path.to_string_lossy();
        const UNC_PREFIX: &str = r"\\?\";
        if let Some(stripped) = s.strip_prefix(UNC_PREFIX) {
            if !stripped.starts_with("UNC\\") {
                return PathBuf::from(stripped);
            }
        }
    }
    path
}

pub fn canonicalize_arg(cwd: &Path, arg: &str) -> Option<PathBuf> {
    let path = Path::new(arg);
    let abs = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };
    abs.canonicalize().ok().map(strip_unc_prefix)
}

#[tauri::command]
pub async fn read_text_file_by_path(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn write_text_file_by_path(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|err| err.to_string())
}

pub fn bring_to_front(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn ingest_initial_args(app: tauri::AppHandle, argv: Vec<String>) {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let canonical: Vec<PathBuf> = argv
        .iter()
        .skip(1)
        .filter_map(|a| canonicalize_arg(&cwd, a))
        .collect();
    if !canonical.is_empty() {
        route_paths(&app, canonical);
    }
}

pub fn handle_second_invocation(app: &tauri::AppHandle, argv: Vec<String>, cwd: String) {
    bring_to_front(app);
    let cwd_path = PathBuf::from(&cwd);
    let canonical: Vec<PathBuf> = argv
        .iter()
        .skip(1)
        .filter_map(|a| canonicalize_arg(&cwd_path, a))
        .collect();
    if !canonical.is_empty() {
        route_paths(app, canonical);
    }
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn handle_opened_urls(app: &tauri::AppHandle, urls: Vec<tauri::Url>) {
    let canonical: Vec<PathBuf> = urls
        .into_iter()
        .filter_map(|url| url.to_file_path().ok())
        .filter_map(|p| p.canonicalize().ok())
        .map(strip_unc_prefix)
        .collect();
    if !canonical.is_empty() {
        route_paths(app, canonical);
    }
}

pub fn route_paths(app: &tauri::AppHandle, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    bring_to_front(app);
    let state = app.state::<LaunchFilesState>();
    let mut pending = state.pending.lock().expect("pending lock poisoned");
    if state.frontend_ready.load(Ordering::SeqCst) {
        drop(pending);
        let payload = json!({
            "paths": paths.iter().map(|p| p.to_string_lossy().into_owned()).collect::<Vec<_>>()
        });
        let _ = app.emit("markpad://open-files", payload);
    } else {
        pending.extend(paths);
    }
}

#[tauri::command]
pub async fn get_pending_files(
    state: tauri::State<'_, LaunchFilesState>,
) -> Result<Vec<String>, String> {
    let mut pending = state.pending.lock().expect("pending lock poisoned");
    let drained = std::mem::take(&mut *pending);
    state.frontend_ready.store(true, Ordering::SeqCst);
    drop(pending);
    Ok(drained
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}
