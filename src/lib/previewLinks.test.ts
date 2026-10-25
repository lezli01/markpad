import { describe, expect, it } from "vitest";
import { findLink, joinPath, resolveLinkAction } from "./previewLinks";

const DOC = "/Users/me/notes/index.md";

describe("resolveLinkAction", () => {
  it("treats a fragment as an in-document anchor", () => {
    expect(resolveLinkAction("#getting-started", DOC)).toEqual({
      kind: "anchor",
      fragment: "getting-started",
    });
    expect(resolveLinkAction("#", DOC)).toEqual({ kind: "anchor", fragment: "" });
  });

  it("sends web, mail and phone links to the system", () => {
    for (const href of [
      "https://example.com/docs?q=1#top",
      "http://www.example.com/",
      "mailto:someone@example.com",
      "tel:+15551234567",
    ]) {
      expect(resolveLinkAction(href, DOC)).toEqual({ kind: "external", url: href });
    }
  });

  it("opens linked documents relative to the current file", () => {
    const cases: Array<[string, string]> = [
      ["other.md", "/Users/me/notes/other.md"],
      ["./sub/guide.markdown#setup", "/Users/me/notes/sub/guide.markdown"],
      ["../data/config.json?raw", "/Users/me/data/config.json"],
      ["My%20Notes.md", "/Users/me/notes/My Notes.md"],
      ["deploy.yml", "/Users/me/notes/deploy.yml"],
      ["/etc/app/settings.yaml", "/etc/app/settings.yaml"],
      ["file:///Users/me/todo.md", "/Users/me/todo.md"],
    ];
    for (const [href, path] of cases) {
      expect(resolveLinkAction(href, DOC), href).toEqual({
        kind: "document",
        path,
      });
    }
  });

  it("resolves links in a Windows document with backslashes", () => {
    expect(resolveLinkAction("../other.md", "C:\\docs\\notes\\index.md")).toEqual({
      kind: "document",
      path: "C:\\docs\\other.md",
    });
    expect(resolveLinkAction("file:///C:/docs/a.md", null)).toEqual({
      kind: "document",
      path: "C:/docs/a.md",
    });
  });

  it("cannot resolve a relative link in an untitled document", () => {
    expect(resolveLinkAction("other.md", null)).toEqual({ kind: "blocked" });
    expect(resolveLinkAction("/abs/other.md", null)).toEqual({
      kind: "document",
      path: "/abs/other.md",
    });
  });

  it("blocks everything that is neither external nor a document", () => {
    for (const href of [
      "image.png",
      "./docs/report.pdf",
      "/index.html",
      "../secret",
      "file:///etc/passwd",
      "file://server/share/notes.md",
      "javascript:alert(1)",
      "data:text/html,<h1>hi</h1>",
      "tauri://localhost/",
      "",
    ]) {
      expect(resolveLinkAction(href, DOC), href).toEqual({ kind: "blocked" });
    }
  });
});

describe("joinPath", () => {
  it("never climbs above the root", () => {
    expect(joinPath("/a/doc.md", "../../../x.md")).toBe("/x.md");
    expect(joinPath("C:\\a\\doc.md", "..\\..\\x.md")).toBe("C:\\x.md");
  });
});

describe("findLink", () => {
  function render(html: string): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = html;
    return root;
  }

  it("finds the href of an HTML link from a nested element", () => {
    const root = render('<a href="https://example.com"><strong>go</strong></a>');
    expect(findLink(root.querySelector("strong"))).toBe("https://example.com");
  });

  it("finds an image-map area", () => {
    const root = render(
      '<map name="m"><area shape="rect" href="https://example.com/area"></map>',
    );
    expect(findLink(root.querySelector("area"))).toBe("https://example.com/area");
  });

  it("finds an SVG link carrying xlink:href", () => {
    const root = render(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<a xlink:href="https://example.com/node"><text>node</text></a></svg>',
    );
    expect(findLink(root.querySelector("text"))).toBe("https://example.com/node");
  });

  it("returns null outside a link", () => {
    const root = render("<p>plain</p>");
    expect(findLink(root.querySelector("p"))).toBeNull();
    expect(findLink(null)).toBeNull();
  });
});
