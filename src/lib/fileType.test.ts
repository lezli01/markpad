import { describe, it, expect } from "vitest";
import { detectFileType } from "./fileType";

describe("detectFileType", () => {
  it("detects markdown files with .md extension", () => {
    expect(detectFileType("/path/to/file.md")).toBe("markdown");
  });

  it("detects markdown files with .markdown extension", () => {
    expect(detectFileType("/path/to/file.markdown")).toBe("markdown");
  });

  it("detects JSON files with .json extension", () => {
    expect(detectFileType("/path/to/config.json")).toBe("json");
  });

  it("handles mixed case extensions", () => {
    expect(detectFileType("/path/to/file.JSON")).toBe("json");
    expect(detectFileType("/path/to/file.MD")).toBe("markdown");
    expect(detectFileType("/path/to/file.Markdown")).toBe("markdown");
  });

  it("returns unknown for files without supported extensions", () => {
    expect(detectFileType("/path/to/file.txt")).toBe("unknown");
    expect(detectFileType("/path/to/file.doc")).toBe("unknown");
    expect(detectFileType("randomstring")).toBe("unknown");
  });

  it("returns unknown for null or empty path", () => {
    expect(detectFileType(null)).toBe("unknown");
    expect(detectFileType("")).toBe("unknown");
  });

  it("handles Windows-style paths", () => {
    expect(detectFileType("C:\\Users\\name\\document.md")).toBe("markdown");
    expect(detectFileType("D:\\data\\config.json")).toBe("json");
  });

  it("handles paths with multiple dots", () => {
    expect(detectFileType("/path/to/file.v1.2.3.md")).toBe("markdown");
    expect(detectFileType("/path/to/config.dev.json")).toBe("json");
  });

  it("handles nested directories", () => {
    expect(detectFileType("/home/user/projects/markpad/specs/002-split-pane-editor-layout/plan.md")).toBe("markdown");
    expect(detectFileType("/root/.config/markpad/settings.json")).toBe("json");
  });
});
