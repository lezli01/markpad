import { useMemo } from "react";
import { renderMarkdown } from "../lib/markdown";

type PreviewProps = {
  markdown: string;
};

export default function Preview({ markdown }: PreviewProps) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);

  if (markdown === "") {
    return (
      <div className="milf-preview h-full overflow-auto p-4 text-sm italic text-[color:var(--islands-muted)]">
        Preview will appear here.
      </div>
    );
  }

  return (
    <div
      className="milf-preview h-full overflow-auto p-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
