import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source));
}
