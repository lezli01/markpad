import Editor from "./Editor";
import Preview from "./Preview";

type WorkspaceProps = {
  text: string;
  onTextChange: (next: string) => void;
};

const islandsBackground =
  "h-screen w-screen bg-gradient-to-br from-[color:var(--islands-bg-from)] to-[color:var(--islands-bg-to)]";

const islandCard =
  "flex-1 min-w-0 min-h-0 min-h-[200px] flex flex-col rounded-2xl bg-[color:var(--islands-surface)] ring-1 ring-[color:var(--islands-ring)] shadow-sm backdrop-blur overflow-hidden";

const islandLabel =
  "text-xs uppercase tracking-wide text-[color:var(--islands-muted)] px-4 pt-3 pb-1 select-none";

export default function Workspace({ text, onTextChange }: WorkspaceProps) {
  return (
    <div className={islandsBackground}>
      <div className="flex flex-col md:flex-row gap-4 p-4 md:p-6 h-full">
        <section className={islandCard} aria-label="Editor">
          <div className={islandLabel}>Editor</div>
          <div className="flex-1 min-h-0 px-4 pb-4">
            <Editor value={text} onChange={onTextChange} />
          </div>
        </section>
        <section className={islandCard} aria-label="Preview">
          <div className={islandLabel}>Preview</div>
          <div className="flex-1 min-h-0">
            <Preview markdown={text} />
          </div>
        </section>
      </div>
    </div>
  );
}
