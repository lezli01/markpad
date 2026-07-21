import { describe, expect, it } from "vitest";
import {
  asDocumentLanguage,
  hasLanguageExtension,
  languageFromPath,
  resolveLanguage,
} from "./documentLanguage";

describe("languageFromPath", () => {
  it("detects .json case-insensitively", () => {
    expect(languageFromPath("C:\\data\\config.json")).toBe("json");
    expect(languageFromPath("/home/user/Data.JSON")).toBe("json");
  });

  it("defaults everything else to markdown", () => {
    expect(languageFromPath("notes.md")).toBe("markdown");
    expect(languageFromPath("notes.markdown")).toBe("markdown");
    expect(languageFromPath("archive.json.bak")).toBe("markdown");
    expect(languageFromPath(null)).toBe("markdown");
  });

  it("requires .json to be an extension, not a name fragment", () => {
    expect(languageFromPath("json")).toBe("markdown");
    expect(languageFromPath("not-json.txt")).toBe("markdown");
  });
});

describe("resolveLanguage", () => {
  it("prefers the override when set", () => {
    expect(resolveLanguage("readme.md", "json")).toBe("json");
    expect(resolveLanguage("data.json", "markdown")).toBe("markdown");
  });

  it("falls back to the path without an override", () => {
    expect(resolveLanguage("data.json", null)).toBe("json");
    expect(resolveLanguage(null, null)).toBe("markdown");
  });
});

describe("hasLanguageExtension", () => {
  it("recognizes the language-bearing extensions", () => {
    expect(hasLanguageExtension("a.json")).toBe(true);
    expect(hasLanguageExtension("a.md")).toBe(true);
    expect(hasLanguageExtension("a.MARKDOWN")).toBe(true);
  });

  it("rejects extensionless and unknown extensions", () => {
    expect(hasLanguageExtension("notes")).toBe(false);
    expect(hasLanguageExtension("notes.txt")).toBe(false);
    expect(hasLanguageExtension("archive.json.bak")).toBe(false);
  });
});

describe("asDocumentLanguage", () => {
  it("accepts only the two known languages", () => {
    expect(asDocumentLanguage("json")).toBe("json");
    expect(asDocumentLanguage("markdown")).toBe("markdown");
    expect(asDocumentLanguage("yaml")).toBeNull();
    expect(asDocumentLanguage(null)).toBeNull();
    expect(asDocumentLanguage(undefined)).toBeNull();
  });
});
