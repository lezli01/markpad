use tauri::{
    webview::NewWindowResponse, App, AppHandle, Runtime, Url, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_opener::OpenerExt;

// The main window only ever shows markpad itself. Anything that would point the
// webview somewhere else — a link in the preview, a `target="_blank"` link, a
// form in raw HTML, a URL dropped onto the window, a script calling
// `window.open` — is stopped here, and web links go to the system browser
// instead. The preview intercepts link clicks on its own (see Preview.tsx);
// this is the backstop that holds whatever the frontend misses.

#[derive(Debug, PartialEq, Eq)]
enum Destination {
    /// The app's own frontend: let the webview go there.
    App,
    /// A link the user's default browser or mail client should handle.
    External,
    /// Anything else (relative files, `file:`, `data:`, `javascript:` …).
    Blocked,
}

fn classify(url: &Url, dev_url: Option<&Url>) -> Destination {
    // WebKit reports the blank page it starts on as a navigation.
    if url.as_str() == "about:blank" {
        return Destination::App;
    }
    let is_app_origin = match url.scheme() {
        // macOS and Linux serve the bundled frontend from tauri://localhost;
        // Windows serves it from http(s)://tauri.localhost.
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" => {
            url.host_str() == Some("tauri.localhost")
                || dev_url.is_some_and(|dev| url.origin() == dev.origin())
        }
        _ => false,
    };
    if is_app_origin {
        // markpad is a single page. Any other path on its origin is a relative
        // link (`other.md`) resolved against the app instead of the document,
        // and would show the app's fallback page or a raw file — not markpad.
        // `tauri://localhost` (how Tauri loads index.html) has an empty path.
        return if matches!(url.path(), "" | "/" | "/index.html") {
            Destination::App
        } else {
            Destination::Blocked
        };
    }

    if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
        Destination::External
    } else {
        Destination::Blocked
    }
}

fn open_externally<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("failed to open {url} in the default browser: {error}");
    }
}

/// Builds the main window from its `tauri.conf.json` entry (which has
/// `"create": false` so Tauri does not build an unguarded copy itself).
pub fn create_main_window<R: Runtime>(app: &App<R>) -> tauri::Result<WebviewWindow<R>> {
    let config = app
        .config()
        .app
        .windows
        .first()
        .expect("tauri.conf.json defines the main window")
        .clone();
    // The Vite dev server only counts as the app in a dev build; a release
    // build must not treat whatever runs on that port as trusted.
    let dev_url = if cfg!(dev) {
        app.config().build.dev_url.clone()
    } else {
        None
    };

    let on_navigation_app = app.handle().clone();
    let on_new_window_app = app.handle().clone();
    WebviewWindowBuilder::from_config(app.handle(), &config)?
        .on_navigation(move |url| match classify(url, dev_url.as_ref()) {
            Destination::App => true,
            Destination::External => {
                open_externally(&on_navigation_app, url);
                false
            }
            Destination::Blocked => false,
        })
        // Never let the webview spawn a second, browser-like window. Without a
        // handler, WebView2 on Windows opens `window.open` / `target="_blank"`
        // in a popup of its own.
        .on_new_window(move |url, _features| {
            if classify(&url, None) == Destination::External {
                open_externally(&on_new_window_app, &url);
            }
            NewWindowResponse::Deny
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).expect("valid test url")
    }

    #[test]
    fn app_frontend_stays_in_the_window() {
        // Tauri loads `tauri://localhost` with no trailing slash, and `tauri:` is
        // not a special scheme, so its path is "" rather than "/".
        assert_eq!(classify(&url("tauri://localhost"), None), Destination::App);
        assert_eq!(classify(&url("tauri://localhost/"), None), Destination::App);
        assert_eq!(
            classify(&url("http://tauri.localhost/index.html"), None),
            Destination::App
        );
        assert_eq!(
            classify(&url("https://tauri.localhost/"), None),
            Destination::App
        );
        assert_eq!(classify(&url("about:blank"), None), Destination::App);
    }

    #[test]
    fn dev_server_is_the_app_only_when_configured() {
        let dev = url("http://localhost:1420");
        let page = url("http://localhost:1420/#intro");
        assert_eq!(classify(&page, Some(&dev)), Destination::App);
        assert_eq!(classify(&page, None), Destination::External);
        assert_eq!(
            classify(&url("http://localhost:1420/other.md"), Some(&dev)),
            Destination::Blocked
        );
        assert_eq!(
            classify(&url("http://localhost:3000/"), Some(&dev)),
            Destination::External
        );
    }

    #[test]
    fn web_and_mail_links_open_externally() {
        for link in [
            "https://example.com/docs",
            "http://example.com",
            "mailto:someone@example.com",
            "tel:+15551234567",
            "https://tauri.localhost.evil.example/",
        ] {
            assert_eq!(classify(&url(link), None), Destination::External, "{link}");
        }
    }

    #[test]
    fn everything_else_is_blocked() {
        for link in [
            "file:///etc/passwd",
            "data:text/html,<h1>hi</h1>",
            "javascript:alert(1)",
            "about:srcdoc",
            "ftp://example.com/file",
            "tauri-evil://localhost/",
            "tauri://localhost/other.md",
            "http://tauri.localhost/notes/other.md",
        ] {
            assert_eq!(classify(&url(link), None), Destination::Blocked, "{link}");
        }
    }
}
