use std::path::{Path, PathBuf};

use serde::Serialize;

const SUPPORTED_EXTENSIONS: [&str; 5] = ["md", "markdown", "json", "yaml", "yml"];
const PREVIEW_LIMIT: usize = 160;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchMatch {
    pub line_number: usize,
    pub preview: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchFile {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub matches: Vec<WorkspaceSearchMatch>,
}

fn is_supported_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            SUPPORTED_EXTENSIONS
                .iter()
                .any(|supported| extension.eq_ignore_ascii_case(supported))
        })
}

fn shorten_preview(line: &str) -> String {
    let trimmed = line.trim();
    let mut chars = trimmed.chars();
    let preview: String = chars.by_ref().take(PREVIEW_LIMIT).collect();
    if chars.next().is_some() {
        format!("{preview}…")
    } else {
        preview
    }
}

fn collect_supported_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut directories = vec![root.to_path_buf()];
    let mut files = Vec::new();

    while let Some(directory) = directories.pop() {
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if directory == root => return Err(error.to_string()),
            // One unreadable nested folder should not hide matches elsewhere.
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            // Do not follow symlinks: a workspace can contain cycles or links
            // that escape the folder the user explicitly selected.
            if file_type.is_symlink() {
                continue;
            }
            let path = entry.path();
            if file_type.is_dir() {
                directories.push(path);
            } else if file_type.is_file() && is_supported_file(&path) {
                files.push(path);
            }
        }
    }

    files.sort_by_cached_key(|path| path.to_string_lossy().to_lowercase());
    Ok(files)
}

fn search_workspace_impl(root: &Path, query: &str) -> Result<Vec<WorkspaceSearchFile>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    if !root.is_dir() {
        return Err("The selected workspace folder is no longer available.".to_string());
    }

    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    for path in collect_supported_files(root)? {
        let Ok(content) = std::fs::read_to_string(&path) else {
            // Supported extension does not guarantee UTF-8 text. Skip binary,
            // locked, or otherwise unreadable files and continue the search.
            continue;
        };
        let matches: Vec<WorkspaceSearchMatch> = content
            .lines()
            .enumerate()
            .filter(|(_, line)| line.to_lowercase().contains(&query_lower))
            .map(|(index, line)| WorkspaceSearchMatch {
                line_number: index + 1,
                preview: shorten_preview(line),
            })
            .collect();

        if matches.is_empty() {
            continue;
        }

        let relative_path = path.strip_prefix(root).unwrap_or(&path);
        results.push(WorkspaceSearchFile {
            name: path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            path: path.to_string_lossy().into_owned(),
            relative_path: relative_path.to_string_lossy().into_owned(),
            matches,
        });
    }

    Ok(results)
}

/// Search supported text documents beneath an explicitly selected workspace.
/// `async` on the command macro moves the blocking traversal off the main
/// thread, keeping the webview responsive while larger folders are scanned.
#[tauri::command(async)]
pub fn search_workspace(
    root_path: String,
    query: String,
) -> Result<Vec<WorkspaceSearchFile>, String> {
    let root = PathBuf::from(root_path);
    search_workspace_impl(&root, &query)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture_root() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "markpad-workspace-search-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn searches_supported_files_recursively_and_groups_matching_lines() {
        let root = fixture_root();
        let nested = root.join("notes");
        std::fs::create_dir_all(&nested).expect("create fixture folders");
        std::fs::write(
            root.join("README.md"),
            "First Needle\nno match\nsecond needle\n",
        )
        .expect("write markdown fixture");
        std::fs::write(nested.join("data.JSON"), "{\"key\": \"NEEDLE\"}\n")
            .expect("write json fixture");
        std::fs::write(nested.join("ignored.txt"), "needle\n").expect("write ignored fixture");

        let results = search_workspace_impl(&root, "needle").expect("search succeeds");

        assert_eq!(results.len(), 2);
        let markdown = results
            .iter()
            .find(|file| file.name == "README.md")
            .expect("markdown result");
        assert_eq!(markdown.matches.len(), 2);
        assert_eq!(markdown.matches[0].line_number, 1);
        assert_eq!(markdown.matches[1].line_number, 3);
        let json = results
            .iter()
            .find(|file| file.name == "data.JSON")
            .expect("json result");
        assert_eq!(json.matches[0].line_number, 1);

        std::fs::remove_dir_all(&root).expect("remove fixture folder");
    }

    #[test]
    fn empty_queries_do_not_traverse_the_workspace() {
        let missing = fixture_root();
        assert_eq!(
            search_workspace_impl(&missing, "  ").expect("empty search succeeds"),
            Vec::<WorkspaceSearchFile>::new()
        );
    }
}
