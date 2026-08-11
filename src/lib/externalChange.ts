// Noticing that a file open in markpad was rewritten behind its back — by
// another editor, a formatter, a `git checkout`, a script. markpad keeps buffers
// in memory, so without this the screen quietly diverges from disk and the next
// save overwrites the other program's work.
//
// There is no filesystem watcher (that would mean a new dependency and a
// per-platform backend for a workflow that is entirely "the user comes back to
// markpad"). Instead the check runs at the moments the user could have returned
// from another program: the window regaining focus, and activating an item in
// the recents list.
//
// Each check is two steps:
//
//   1. stat the path. Nothing else happens if the stamp still matches the
//      revision we last reconciled with — the common case, and it never reads.
//   2. only when the stamp moved, read the file and compare its bytes with the
//      buffer's saved baseline.
//
// Step 2 is what keeps the notice honest. `touch`, a save that wrote identical
// bytes, and markpad's own writes all move the stamp without changing content,
// and none of them should interrupt the user. Comparing content also means a
// stamp we never recorded (a fresh load, a restored session, the moment after a
// save) is safe to leave unknown: the first check just reads once and settles.

import type { DiskStamp, OpenResult, StatResult } from "./fileOpen";

/**
 * The disk revision markpad has already reconciled with the user:
 *   - a stamp — disk was confirmed to match the buffer's saved baseline, or the
 *     user acknowledged the difference and chose to keep their version;
 *   - `"missing"` — the user has been told the file is gone;
 *   - `null` — unknown, so the next check reads to find out.
 *
 * Deliberately not the same thing as "the stamp of savedText": once the user
 * dismisses a notice we must not raise it again for the same revision.
 */
export type DiskBaseline = DiskStamp | "missing" | null;

/** An outside edit that has not been shown to the user and acted on yet. */
export type ExternalChange =
  | { kind: "changed"; stamp: DiskStamp }
  | { kind: "deleted" };

export type CheckTarget = {
  path: string;
  /** The bytes markpad believes are on disk for this buffer. */
  savedText: string;
  diskBaseline: DiskBaseline;
};

/** The part of a recents item this module reasons about; RecentItem satisfies it
    structurally, so App passes its items straight in. */
export type WatchTarget = {
  kind: "file" | "untitled";
  path: string | null;
  loaded: boolean;
  savedText: string;
  diskBaseline: DiskBaseline;
  external: ExternalChange | null;
};

export type CheckOutcome =
  /** Nothing to tell the user. `baseline` is what to remember: the freshly
      confirmed stamp when we read, or the previous value when we could not. */
  | { kind: "unchanged"; baseline: DiskBaseline }
  | { kind: "changed"; change: ExternalChange };

export type CheckDeps = {
  stat(path: string): Promise<StatResult>;
  read(path: string): Promise<OpenResult>;
};

function isStamp(baseline: DiskBaseline): baseline is DiskStamp {
  return baseline !== null && baseline !== "missing";
}

export function sameStamp(a: DiskStamp, b: DiskStamp): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs;
}

/** The baseline to record once the user has been shown `change` and dealt with
    it, either by reloading or by keeping their version. */
export function acknowledgedBaseline(change: ExternalChange): DiskBaseline {
  return change.kind === "deleted" ? "missing" : change.stamp;
}

/**
 * Whether a sweep should look at this item at all.
 *
 * Untitled drafts have no file behind them. A released clean file has no buffer
 * that could be stale — activating it re-reads from disk regardless. And an item
 * already carrying a change has nothing further to learn: the user has been told,
 * and re-reading it on every focus would buy nothing. (If disk moves on again,
 * the stamp recorded when they answer the notice is older than the file's, so the
 * next sweep picks the newer revision up.)
 */
export function needsDiskCheck(item: WatchTarget): boolean {
  return (
    item.kind === "file" &&
    item.path !== null &&
    item.loaded &&
    item.external === null
  );
}

/**
 * Whether an outcome computed for `checked` may still be written onto `current`.
 *
 * The sweep awaits disk between reading an item and updating it, so a save, a
 * reload, or a buffer release can land in between. Each of those resets what the
 * buffer believes is on disk, which makes the in-flight answer meaningless rather
 * than merely late — dropping it lets the next sweep start from the new state.
 */
export function outcomeStillApplies(
  checked: WatchTarget,
  current: WatchTarget,
): boolean {
  return (
    current.loaded &&
    current.path === checked.path &&
    current.savedText === checked.savedText
  );
}

/**
 * Compare one open file against disk. Reads only when the stamp says it must.
 *
 * A stat or read that fails for any reason other than "the file is gone" is
 * treated as "nothing to report": the file may be momentarily locked by the very
 * program that is writing it, and a transient error is not something to
 * interrupt the user with. The baseline is left untouched so the next check
 * tries again.
 */
export async function checkForExternalChange(
  deps: CheckDeps,
  target: CheckTarget,
): Promise<CheckOutcome> {
  const stat = await deps.stat(target.path);
  if (stat.kind === "missing") {
    return target.diskBaseline === "missing"
      ? { kind: "unchanged", baseline: target.diskBaseline }
      : { kind: "changed", change: { kind: "deleted" } };
  }
  if (stat.kind === "error") {
    return { kind: "unchanged", baseline: target.diskBaseline };
  }
  if (
    isStamp(target.diskBaseline) &&
    sameStamp(stat.stamp, target.diskBaseline)
  ) {
    return { kind: "unchanged", baseline: target.diskBaseline };
  }

  const read = await deps.read(target.path);
  if (read.kind !== "ok") {
    return { kind: "unchanged", baseline: target.diskBaseline };
  }
  if (read.content === target.savedText) {
    // The stamp moved but the bytes did not: a touch, or our own save. Record
    // the new stamp so the next check stops at the stat.
    return { kind: "unchanged", baseline: stat.stamp };
  }
  return {
    kind: "changed",
    change: { kind: "changed", stamp: stat.stamp },
  };
}
