import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { headingSlug, renderMarkdown } from "../lib/markdown";

export type PreviewHandle = {
  getScrollTop(): number;
  setScrollTop(top: number): void;
};

type PreviewProps = {
  markdown: string;
};

const Preview = forwardRef<PreviewHandle, PreviewProps>(function Preview(
  { markdown },
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

  useImperativeHandle(
    ref,
    () => ({
      getScrollTop: () => divRef.current?.scrollTop ?? 0,
      setScrollTop: (top) => {
        if (divRef.current) {
          divRef.current.scrollTop = top;
        }
      },
    }),
    [],
  );

  if (markdown === "") {
    return (
      <div
        ref={divRef}
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
      className="markpad-preview h-full overflow-auto p-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

Preview.displayName = "Preview";

export default Preview;
