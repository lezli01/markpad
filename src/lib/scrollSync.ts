/**
 * Position mapping for editor ⇄ preview scroll sync.
 *
 * Both panes describe where they are with the same currency: a (fractional)
 * 1-based *source line*. Each pane knows the pixel offset of the source lines
 * it can see — the editor from CodeMirror's line blocks, the preview from the
 * `data-source-line` attributes markdown.ts stamps on every block element — and
 * the functions here convert between the two by linear interpolation between
 * the nearest known anchors.
 *
 * A pixel-ratio sync (copy `scrollTop / scrollHeight` across) needs none of
 * this, but it drifts as soon as the panes disagree about density: one tall
 * image or a long fenced code block desynchronises everything below it. Anchors
 * keep the mapping exact at every block boundary and only approximate *inside*
 * a block, which is the smallest error available without per-glyph mapping.
 */

export type SyncAnchor = {
  /** 1-based source line. */
  line: number;
  /** Pixel offset of that line's block from the top of the scrollable content. */
  offset: number;
};

/**
 * Sort anchors by source line and make them usable for interpolation: drop
 * garbage (non-finite) entries, keep the first anchor of any duplicated line,
 * and clamp offsets so they never decrease. The monotone clamp matters because
 * an out-of-order offset would make the mapping non-invertible — scrolling down
 * in one pane could scroll the other one up.
 */
export function normalizeAnchors(raw: readonly SyncAnchor[]): SyncAnchor[] {
  const sorted = raw
    .filter((a) => Number.isFinite(a.line) && Number.isFinite(a.offset))
    // Array.prototype.sort is stable, so equal lines keep their input order and
    // the "first wins" rule below is deterministic.
    .slice()
    .sort((a, b) => a.line - b.line);

  const out: SyncAnchor[] = [];
  for (const a of sorted) {
    const last = out[out.length - 1];
    if (last && a.line === last.line) continue;
    out.push({ line: a.line, offset: last ? Math.max(a.offset, last.offset) : a.offset });
  }
  return out;
}

// Index of the first anchor whose `key` is strictly greater than `value`.
// Callers guarantee such an index exists.
function upperBound(
  anchors: readonly SyncAnchor[],
  value: number,
  key: (a: SyncAnchor) => number,
): number {
  let lo = 0;
  let hi = anchors.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(anchors[mid]) > value) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Pixel offset for a (possibly fractional) source line; clamped at both ends. */
export function lineToOffset(anchors: readonly SyncAnchor[], line: number): number {
  if (anchors.length === 0) return 0;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (line <= first.line) return first.offset;
  if (line >= last.line) return last.offset;

  const i = upperBound(anchors, line, (a) => a.line);
  const lo = anchors[i - 1];
  const hi = anchors[i];
  const span = hi.line - lo.line;
  return span > 0 ? lerp(lo.offset, hi.offset, (line - lo.line) / span) : lo.offset;
}

/** Source line at a pixel offset; the inverse of lineToOffset. */
export function offsetToLine(anchors: readonly SyncAnchor[], offset: number): number {
  if (anchors.length === 0) return 1;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (offset <= first.offset) return first.line;
  if (offset >= last.offset) return last.line;

  const i = upperBound(anchors, offset, (a) => a.offset);
  const lo = anchors[i - 1];
  const hi = anchors[i];
  const span = hi.offset - lo.offset;
  // A zero-height block (span 0) has no interior to interpolate: its whole
  // pixel position belongs to the earlier line.
  return span > 0 ? lerp(lo.line, hi.line, (offset - lo.offset) / span) : lo.line;
}
