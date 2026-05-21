import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { renderMarkdown } from "../lib/markdown";

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
        className="milf-preview h-full overflow-auto p-4 text-sm italic text-[color:var(--islands-muted)]"
      >
        Preview will appear here.
      </div>
    );
  }

  return (
    <div
      ref={divRef}
      className="milf-preview h-full overflow-auto p-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

Preview.displayName = "Preview";

export default Preview;
