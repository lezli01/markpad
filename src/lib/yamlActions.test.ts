import { describe, expect, it } from "vitest";
import {
  applyYamlTextAction,
  jsonToYaml,
  yamlDiagnostics,
} from "./yamlActions";

const ok = (text: string) => ({ kind: "ok", text });

describe("applyYamlTextAction format", () => {
  it("re-indents to two spaces", () => {
    expect(
      applyYamlTextAction("root:\n    nested:\n            key: 1\n", "format"),
    ).toEqual(ok("root:\n  nested:\n    key: 1\n"));
  });

  it("keeps comments where they belong", () => {
    expect(
      applyYamlTextAction(
        "# header\nname:   markpad   # trailing\nlist:\n    - a\n",
        "format",
      ),
    ).toEqual(ok("# header\nname: markpad # trailing\nlist:\n  - a\n"));
  });

  it("keeps block literals verbatim", () => {
    const text = "text: |\n  line one\n  line two\n";
    expect(applyYamlTextAction(text, "format")).toEqual(ok(text));
  });

  it("keeps anchors and aliases", () => {
    const text = "base: &b\n  a: 1\nuse: *b\n";
    expect(applyYamlTextAction(text, "format")).toEqual(ok(text));
  });

  it("keeps the document markers of a multi-document file", () => {
    expect(
      applyYamlTextAction("---\na:   1\n---\nb:    2\n", "format"),
    ).toEqual(ok("---\na: 1\n---\nb: 2\n"));
  });

  it("does not re-wrap a long line", () => {
    const text = `key: ${"word ".repeat(30).trim()}\n`;
    expect(applyYamlTextAction(text, "format")).toEqual(ok(text));
  });

  it("preserves a missing trailing newline", () => {
    expect(applyYamlTextAction("a:   1", "format")).toEqual(ok("a: 1"));
  });

  it("leaves a buffer with no content alone", () => {
    // Serializing these would materialize an explicit `null`.
    expect(applyYamlTextAction("", "format")).toEqual(ok(""));
    expect(applyYamlTextAction("# just a note\n", "format")).toEqual(
      ok("# just a note\n"),
    );
  });

  it("reports invalid YAML without output", () => {
    const result = applyYamlTextAction("a: 1\n b: 2\n", "format");
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/^Not valid YAML: /);
      // The parser's excerpt-and-caret tail is not part of the message.
      expect(result.message).not.toContain("\n");
    }
  });

  it("reports a duplicate key", () => {
    const result = applyYamlTextAction("a: 1\na: 2\n", "format");
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toBe("Not valid YAML: Map keys must be unique");
    }
  });
});

describe("applyYamlTextAction sortKeys", () => {
  it("sorts mapping keys recursively", () => {
    expect(
      applyYamlTextAction("b:\n  d: 1\n  c: 2\na: 3\n", "sortKeys"),
    ).toEqual(ok("a: 3\nb:\n  c: 2\n  d: 1\n"));
  });

  it("keeps sequence order but sorts mappings inside sequences", () => {
    expect(
      applyYamlTextAction("- z: 1\n  a: 2\n- 3\n- 1\n", "sortKeys"),
    ).toEqual(ok("- a: 2\n  z: 1\n- 3\n- 1\n"));
  });

  it("carries each entry's comment along with it", () => {
    expect(
      applyYamlTextAction("b: 1 # about b\na: 2 # about a\n", "sortKeys"),
    ).toEqual(ok("a: 2 # about a\nb: 1 # about b\n"));
  });

  it("leaves a mapping with a non-scalar key alone", () => {
    const text = "? - a\n  - b\n: pair\n";
    expect(applyYamlTextAction(text, "sortKeys")).toEqual(ok(text));
  });

  it("reports invalid YAML without output", () => {
    expect(applyYamlTextAction("a: 1\na: 2\n", "sortKeys").kind).toBe("error");
  });
});

describe("jsonToYaml", () => {
  it("converts an object to block YAML", () => {
    expect(jsonToYaml('{"b":1,"a":{"x":[1,2]},"s":"hi: there"}')).toEqual(
      ok('b: 1\na:\n  x:\n    - 1\n    - 2\ns: "hi: there"\n'),
    );
  });

  it("converts an array to a block sequence", () => {
    expect(jsonToYaml('[1,"two",{"three":3}]')).toEqual(
      ok("- 1\n- two\n- three: 3\n"),
    );
  });

  it("declines a bare scalar", () => {
    expect(jsonToYaml("42").kind).toBe("error");
    expect(jsonToYaml('"note"').kind).toBe("error");
    expect(jsonToYaml("null").kind).toBe("error");
  });

  it("declines text that is not JSON", () => {
    expect(jsonToYaml("a: 1").kind).toBe("error");
    expect(jsonToYaml("{ nope }").kind).toBe("error");
  });
});

describe("yamlDiagnostics", () => {
  it("says nothing about an empty or valid buffer", () => {
    expect(yamlDiagnostics("")).toEqual([]);
    expect(yamlDiagnostics("   \n\n")).toEqual([]);
    expect(yamlDiagnostics("a: 1\nb:\n  - x\n")).toEqual([]);
  });

  it("reports a tab used as indentation, at its offset", () => {
    const text = "a:\n\tb: 1\n";
    const [first] = yamlDiagnostics(text);
    expect(first.severity).toBe("error");
    expect(first.message).toBe("Tabs are not allowed as indentation");
    expect(text.slice(first.from, first.to)).toBe("\t");
  });

  it("reports a duplicate key", () => {
    const found = yamlDiagnostics("a: 1\na: 2\n");
    expect(found).toHaveLength(1);
    expect(found[0].message).toBe("Map keys must be unique");
  });

  it("reports the parser's warnings too", () => {
    const found = yamlDiagnostics("%FOO bar\n---\na: 1\n");
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe("warning");
    expect(found[0].message).toBe("Unknown directive %FOO");
  });

  it("keeps every range inside the document and non-empty", () => {
    const text = "a: [1, 2\n";
    for (const found of yamlDiagnostics(text)) {
      expect(found.from).toBeGreaterThanOrEqual(0);
      expect(found.to).toBeGreaterThan(found.from);
      expect(found.to).toBeLessThanOrEqual(text.length);
    }
  });

  it("reports every document of a multi-document file", () => {
    expect(yamlDiagnostics("a: 1\n---\nb: 1\nb: 2\n")).toHaveLength(1);
  });
});
