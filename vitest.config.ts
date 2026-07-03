import { defineConfig } from "vitest/config";

// A standalone Vitest config (takes precedence over vite.config.ts) so the
// Tauri-tuned dev server config is not loaded for unit tests. jsdom provides
// the `window` that DOMPurify needs in src/lib/markdown.ts; the CodeMirror
// state/tree used by the formatting tests is pure JS and needs no DOM.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
