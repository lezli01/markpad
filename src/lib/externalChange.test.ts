import { describe, expect, it, vi } from "vitest";

import {
  acknowledgedBaseline,
  checkForExternalChange,
  needsDiskCheck,
  outcomeStillApplies,
  sameStamp,
  type CheckDeps,
  type DiskBaseline,
  type WatchTarget,
} from "./externalChange";
import type { DiskStamp, OpenResult, StatResult } from "./fileOpen";

const PATH = "/tmp/notes.md";
const SAVED = "# Notes\n";

function stamp(mtimeMs: number | null, size: number): DiskStamp {
  return { mtimeMs, size };
}

// Deps whose two halves are independently scripted, so a test can assert that
// the read never happened on the stat-only fast path.
function deps(stat: StatResult, read: OpenResult = { kind: "cancelled" }) {
  const fns: CheckDeps = {
    stat: vi.fn(async () => stat),
    read: vi.fn(async () => read),
  };
  return fns as CheckDeps & {
    stat: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
  };
}

function onDisk(content: string): OpenResult {
  return { kind: "ok", name: "notes.md", path: PATH, content };
}

function target(diskBaseline: DiskBaseline) {
  return { path: PATH, savedText: SAVED, diskBaseline };
}

function watched(over: Partial<WatchTarget> = {}): WatchTarget {
  return {
    kind: "file",
    path: PATH,
    loaded: true,
    savedText: SAVED,
    diskBaseline: null,
    external: null,
    ...over,
  };
}

describe("sameStamp", () => {
  it("compares both mtime and size", () => {
    expect(sameStamp(stamp(1000, 8), stamp(1000, 8))).toBe(true);
    expect(sameStamp(stamp(1000, 8), stamp(2000, 8))).toBe(false);
    expect(sameStamp(stamp(1000, 8), stamp(1000, 9))).toBe(false);
  });

  it("treats an unavailable mtime as a value, not a wildcard", () => {
    expect(sameStamp(stamp(null, 8), stamp(null, 8))).toBe(true);
    expect(sameStamp(stamp(null, 8), stamp(1000, 8))).toBe(false);
  });
});

describe("checkForExternalChange", () => {
  it("stops at the stat when the stamp still matches", async () => {
    const d = deps({ kind: "ok", stamp: stamp(1000, 8) });
    const outcome = await checkForExternalChange(d, target(stamp(1000, 8)));

    expect(outcome).toEqual({ kind: "unchanged", baseline: stamp(1000, 8) });
    expect(d.read).not.toHaveBeenCalled();
  });

  it("reports a change when the stamp moved and the bytes differ", async () => {
    const d = deps(
      { kind: "ok", stamp: stamp(2000, 20) },
      onDisk("# Notes\n\nedited elsewhere\n"),
    );
    const outcome = await checkForExternalChange(d, target(stamp(1000, 8)));

    expect(outcome).toEqual({
      kind: "changed",
      change: { kind: "changed", stamp: stamp(2000, 20) },
    });
  });

  it("stays quiet when the stamp moved but the bytes did not", async () => {
    const d = deps({ kind: "ok", stamp: stamp(2000, 8) }, onDisk(SAVED));
    const outcome = await checkForExternalChange(d, target(stamp(1000, 8)));

    // A touch, or markpad's own save. Recording the stamp is what keeps the next
    // check on the fast path instead of re-reading forever.
    expect(outcome).toEqual({ kind: "unchanged", baseline: stamp(2000, 8) });
    expect(d.read).toHaveBeenCalledTimes(1);
  });

  it("reads once to settle an unknown baseline", async () => {
    const d = deps({ kind: "ok", stamp: stamp(1000, 8) }, onDisk(SAVED));
    const outcome = await checkForExternalChange(d, target(null));

    expect(outcome).toEqual({ kind: "unchanged", baseline: stamp(1000, 8) });
    expect(d.read).toHaveBeenCalledTimes(1);
  });

  it("reports a change an unknown baseline turns out to be hiding", async () => {
    // Session restore: the file was edited while markpad was closed, so there is
    // no stamp to compare and only the bytes can tell.
    const d = deps({ kind: "ok", stamp: stamp(9000, 40) }, onDisk("elsewhere"));
    const outcome = await checkForExternalChange(d, target(null));

    expect(outcome).toEqual({
      kind: "changed",
      change: { kind: "changed", stamp: stamp(9000, 40) },
    });
  });

  it("reports a file that is gone", async () => {
    const d = deps({ kind: "missing" });
    const outcome = await checkForExternalChange(d, target(stamp(1000, 8)));

    expect(outcome).toEqual({
      kind: "changed",
      change: { kind: "deleted" },
    });
    expect(d.read).not.toHaveBeenCalled();
  });

  it("does not re-report a deletion the user already acknowledged", async () => {
    const d = deps({ kind: "missing" });
    const outcome = await checkForExternalChange(d, target("missing"));

    expect(outcome).toEqual({ kind: "unchanged", baseline: "missing" });
  });

  it("compares bytes when an acknowledged-missing file reappears", async () => {
    const d = deps({ kind: "ok", stamp: stamp(3000, 8) }, onDisk(SAVED));
    const outcome = await checkForExternalChange(d, target("missing"));

    expect(outcome).toEqual({ kind: "unchanged", baseline: stamp(3000, 8) });
  });

  it("keeps quiet and keeps the baseline when the stat fails", async () => {
    const d = deps({ kind: "error", message: "locked" });
    const outcome = await checkForExternalChange(d, target(stamp(1000, 8)));

    expect(outcome).toEqual({ kind: "unchanged", baseline: stamp(1000, 8) });
    expect(d.read).not.toHaveBeenCalled();
  });

  it("keeps quiet and keeps the baseline when the read fails", async () => {
    // Half-written file mid-save by the other program: retry on the next check
    // rather than interrupt with a change we cannot describe.
    const d = deps(
      { kind: "ok", stamp: stamp(2000, 20) },
      { kind: "error", message: "locked" },
    );
    const outcome = await checkForExternalChange(d, target(stamp(1000, 8)));

    expect(outcome).toEqual({ kind: "unchanged", baseline: stamp(1000, 8) });
  });
});

describe("needsDiskCheck", () => {
  it("checks a loaded file with nothing pending", () => {
    expect(needsDiskCheck(watched())).toBe(true);
  });

  it("skips untitled drafts, which have no file", () => {
    const draft = watched({ kind: "untitled", path: null });
    expect(needsDiskCheck(draft)).toBe(false);
  });

  it("skips a released buffer, which is re-read on activation anyway", () => {
    const released = watched({ loaded: false, savedText: "" });
    expect(needsDiskCheck(released)).toBe(false);
  });

  it("skips an item whose change the user has not answered yet", () => {
    const flagged = watched({ external: { kind: "deleted" } });
    expect(needsDiskCheck(flagged)).toBe(false);
  });
});

describe("outcomeStillApplies", () => {
  const checked = watched({ diskBaseline: stamp(1000, 8) });

  it("applies when nothing moved underneath the check", () => {
    const current = watched({ diskBaseline: stamp(1000, 8) });
    expect(outcomeStillApplies(checked, current)).toBe(true);
  });

  it("drops an answer invalidated by a save landing mid-sweep", () => {
    const saved = watched({ savedText: "saved since" });
    expect(outcomeStillApplies(checked, saved)).toBe(false);
  });

  it("drops an answer for a buffer released mid-sweep", () => {
    const released = watched({ loaded: false, savedText: "" });
    expect(outcomeStillApplies(checked, released)).toBe(false);
  });

  it("drops an answer for a file saved under a new path", () => {
    const moved = watched({ path: "/tmp/other.md" });
    expect(outcomeStillApplies(checked, moved)).toBe(false);
  });
});

describe("acknowledgedBaseline", () => {
  it("remembers the revision the user was shown", () => {
    const change = { kind: "changed", stamp: stamp(2000, 20) } as const;
    expect(acknowledgedBaseline(change)).toEqual(stamp(2000, 20));
  });

  it("remembers that a deletion was reported", () => {
    expect(acknowledgedBaseline({ kind: "deleted" })).toBe("missing");
  });
});
