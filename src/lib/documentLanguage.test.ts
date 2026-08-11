import { describe, expect, it } from "vitest";
import {
  asDocumentLanguage,
  defaultExtension,
  hasLanguageExtension,
  isDataLanguage,
  languageFromPath,
  resolveLanguage,
} from "./documentLanguage";

describe("languageFromPath", () => {
  it("detects .json case-insensitively", () => {
    expect(languageFromPath("C:\\data\\config.json")).toBe("json");
    expect(languageFromPath("/home/user/Data.JSON")).toBe("json");
  });

  it("detects both YAML spellings, case-insensitively", () => {
    expect(languageFromPath("C:\\repo\\docker-compose.yml")).toBe("yaml");
    expect(languageFromPath("/home/user/deploy.yaml")).toBe("yaml");
    expect(languageFromPath("/home/user/CI.YML")).toBe("yaml");
  });

  it("defaults everything else to markdown", () => {
    expect(languageFromPath("notes.md")).toBe("markdown");
    expect(languageFromPath("notes.markdown")).toBe("markdown");
    expect(languageFromPath("archive.json.bak")).toBe("markdown");
    expect(languageFromPath("archive.yaml.bak")).toBe("markdown");
    expect(languageFromPath(null)).toBe("markdown");
  });

  it("requires the extension to be one, not a name fragment", () => {
    expect(languageFromPath("json")).toBe("markdown");
    expect(languageFromPath("not-json.txt")).toBe("markdown");
    expect(languageFromPath("yaml")).toBe("markdown");
    expect(languageFromPath("myml.txt")).toBe("markdown");
  });
});

describe("resolveLanguage", () => {
  it("prefers the override when set", () => {
    expect(resolveLanguage("readme.md", "json")).toBe("json");
    expect(resolveLanguage("readme.md", "yaml")).toBe("yaml");
    expect(resolveLanguage("data.json", "markdown")).toBe("markdown");
  });

  it("falls back to the path without an override", () => {
    expect(resolveLanguage("data.json", null)).toBe("json");
    expect(resolveLanguage("data.yml", null)).toBe("yaml");
    expect(resolveLanguage(null, null)).toBe("markdown");
  });
});

describe("hasLanguageExtension", () => {
  it("recognizes the language-bearing extensions", () => {
    expect(hasLanguageExtension("a.json")).toBe(true);
    expect(hasLanguageExtension("a.yaml")).toBe(true);
    expect(hasLanguageExtension("a.yml")).toBe(true);
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
  it("accepts only the three known languages", () => {
    expect(asDocumentLanguage("json")).toBe("json");
    expect(asDocumentLanguage("yaml")).toBe("yaml");
    expect(asDocumentLanguage("markdown")).toBe("markdown");
    expect(asDocumentLanguage("yml")).toBeNull();
    expect(asDocumentLanguage("toml")).toBeNull();
    expect(asDocumentLanguage(null)).toBeNull();
    expect(asDocumentLanguage(undefined)).toBeNull();
  });
});

describe("isDataLanguage", () => {
  it("separates the data languages from prose", () => {
    expect(isDataLanguage("json")).toBe(true);
    expect(isDataLanguage("yaml")).toBe(true);
    expect(isDataLanguage("markdown")).toBe(false);
  });
});

describe("defaultExtension", () => {
  it("names the extension a first Save suggests", () => {
    expect(defaultExtension("markdown")).toBe("md");
    expect(defaultExtension("json")).toBe("json");
    expect(defaultExtension("yaml")).toBe("yaml");
  });
});
