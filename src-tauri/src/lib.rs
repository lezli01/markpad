mod launch_files;
mod session;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            launch_files::handle_second_invocation(app, argv, cwd);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(launch_files::LaunchFilesState::default())
        .setup(|app| {
            launch_files::ingest_initial_args(
                app.handle().clone(),
                std::env::args().collect(),
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            launch_files::get_pending_files,
            launch_files::read_text_file_by_path,
            launch_files::write_text_file_by_path,
            session::load_session,
            session::save_session
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                launch_files::handle_opened_urls(_app, urls);
            }
        });
}
