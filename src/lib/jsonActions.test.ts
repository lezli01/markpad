import { describe, expect, it } from "vitest";
import { applyJsonTextAction } from "./jsonActions";

const ok = (text: string) => ({ kind: "ok", text });

describe("applyJsonTextAction format", () => {
  it("pretty-prints with 2-space indent", () => {
    expect(applyJsonTextAction('{"a":1,"b":[true,null]}', "format")).toEqual(
      ok('{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}'),
    );
  });

  it("preserves a trailing newline", () => {
    expect(applyJsonTextAction('{"a":1}\n', "format")).toEqual(
      ok('{\n  "a": 1\n}\n'),
    );
  });

  it("does not invent a trailing newline", () => {
    expect(applyJsonTextAction('{"a":1}', "format")).toEqual(
      ok('{\n  "a": 1\n}'),
    );
  });

  it("handles scalars and unicode", () => {
    expect(applyJsonTextAction('"héllo ☃"', "format")).toEqual(ok('"héllo ☃"'));
    expect(applyJsonTextAction("42", "format")).toEqual(ok("42"));
  });

  it("reports invalid JSON without output", () => {
    const result = applyJsonTextAction('{"a": 1,}', "format");
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/^Not valid JSON: /);
    }
  });
});

describe("applyJsonTextAction minify", () => {
  it("collapses to a single line", () => {
    expect(
      applyJsonTextAction('{\n  "a": 1,\n  "b": [1, 2]\n}\n', "minify"),
    ).toEqual(ok('{"a":1,"b":[1,2]}\n'));
  });
});

describe("applyJsonTextAction sortKeys", () => {
  it("sorts object keys recursively and pretty-prints", () => {
    expect(
      applyJsonTextAction('{"b":{"d":1,"c":2},"a":3}', "sortKeys"),
    ).toEqual(
      ok('{\n  "a": 3,\n  "b": {\n    "c": 2,\n    "d": 1\n  }\n}'),
    );
  });

  it("preserves array order but sorts objects inside arrays", () => {
    expect(applyJsonTextAction('[{"z":1,"a":2},3,1]', "sortKeys")).toEqual(
      ok('[\n  {\n    "a": 2,\n    "z": 1\n  },\n  3,\n  1\n]'),
    );
  });

  it("keeps a literal __proto__ key as data", () => {
    expect(
      applyJsonTextAction('{"b":1,"__proto__":{"x":2}}', "sortKeys"),
    ).toEqual(
      ok('{\n  "__proto__": {\n    "x": 2\n  },\n  "b": 1\n}'),
    );
  });
});
