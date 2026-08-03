import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { headingSlug, renderMarkdown } from "../lib/markdown";
import {
  lineToOffset,
  normalizeAnchors,
  offsetToLine,
  type SyncAnchor,
} from "../lib/scrollSync";

export type PreviewHandle = {
  getScrollTop(): number;
  setScrollTop(top: number): void;
  /** Source line shown at the top of the viewport, or null before mount. */
  getSyncLine(): number | null;
  scrollToSyncLine(line: number): void;
};

type PreviewProps = {
  markdown: string;
  /** Fired on every scroll of the preview, user-driven or programmatic. */
  onScroll?: () => void;
};

const Preview = forwardRef<PreviewHandle, PreviewProps>(function Preview(
  { markdown, onScroll },
  ref,
) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);
  const divRef = useRef<HTMLDivElement>(null);

  // Intercept clicks on in-document anchors (e.g. a table of contents linking to
  // `#some-heading`) and smooth-scroll to the target *within* the preview's own
  // scroll container, rather than letting the click mutate the app's URL hash.
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const link = (event.target as HTMLElement).closest("a");
      const href = link?.getAttribute("href");
      if (!href || !href.startsWith("#")) return; // leave external links alone
      // This is an in-document anchor: we own the scrolling, so never let the
      // click fall through to default fragment navigation (even if the target
      // is missing) which would mutate the app URL hash.
      event.preventDefault();
      const container = divRef.current;
      if (!container) return;
      // Resolve the fragment through the same slugify the heading ids use, so a
      // hand-written link matches its heading despite punctuation/encoding
      // differences (see headingSlug). Decode any %-escapes markdown-it added.
      let fragment = href.slice(1);
      try {
        fragment = decodeURIComponent(fragment);
      } catch {
        // Malformed %-sequence — fall back to the raw fragment.
      }
      const id = headingSlug(fragment);
      if (!id) return;
      const target = container.querySelector(`[id="${CSS.escape(id)}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [],
  );

  const lineCount = useMemo(() => markdown.split("\n").length, [markdown]);

  // Measuring every block costs one getBoundingClientRect per element, and a
  // scroll event can arrive every frame, so the result is cached until
  // something that could have moved a block happens: new content, a reflow
  // (an image finished loading — scrollHeight changes), or a pane resize.
  const cacheRef = useRef<{
    html: string;
    scrollHeight: number;
    clientWidth: number;
    anchors: SyncAnchor[];
  } | null>(null);

  const readAnchors = useCallback((): SyncAnchor[] => {
    const container = divRef.current;
    if (!container) return [];
    const { scrollHeight, clientWidth } = container;
    const cached = cacheRef.current;
    if (
      cached &&
      cached.html === html &&
      cached.scrollHeight === scrollHeight &&
      cached.clientWidth === clientWidth
    ) {
      return cached.anchors;
    }

    // Viewport y of the content's origin (offset 0), which is above the
    // container's top edge by however far it is scrolled.
    const originY = container.getBoundingClientRect().top - container.scrollTop;
    const raw: SyncAnchor[] = [{ line: 1, offset: 0 }];
    for (const el of container.querySelectorAll<HTMLElement>(
      "[data-source-line]",
    )) {
      const line = Number(el.dataset.sourceLine);
      if (!Number.isFinite(line)) continue;
      raw.push({ line, offset: el.getBoundingClientRect().top - originY });
    }
    // Tail anchor: one line past the document maps to the end of the content,
    // so the last block interpolates instead of clamping to its own top.
    raw.push({ line: lineCount + 1, offset: scrollHeight });

    const anchors = normalizeAnchors(raw);
    cacheRef.current = { html, scrollHeight, clientWidth, anchors };
    return anchors;
  }, [html, lineCount]);

  useImperativeHandle(
    ref,
    () => ({
      getScrollTop: () => divRef.current?.scrollTop ?? 0,
      setScrollTop: (top) => {
        if (divRef.current) {
          divRef.current.scrollTop = top;
        }
      },
      getSyncLine: () => {
        const container = divRef.current;
        if (!container) return null;
        return offsetToLine(readAnchors(), container.scrollTop);
      },
      scrollToSyncLine: (line) => {
        const container = divRef.current;
        if (!container) return;
        container.scrollTop = lineToOffset(readAnchors(), line);
      },
    }),
    [readAnchors],
  );

  if (markdown === "") {
    return (
      <div
        ref={divRef}
        onScroll={onScroll}
        className="markpad-preview h-full overflow-auto p-4 text-sm italic text-[color:var(--muted)]"
      >
        Preview will appear here.
      </div>
    );
  }

  return (
    <div
      ref={divRef}
      onClick={handleClick}
      onScroll={onScroll}
      className="markpad-preview h-full overflow-auto p-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

Preview.displayName = "Preview";

export default Preview;
