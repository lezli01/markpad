/**
 * File type detection based on file extension.
 * Used to determine which editor configuration and UI elements to show.
 */
export type FileType = 'markdown' | 'json' | 'unknown';

/**
 * Detects the file type from a file path.
 * Returns 'markdown' for .md and .markdown extensions,
 * 'json' for .json extensions, and 'unknown' otherwise.
 */
export function detectFileType(path: string | null): FileType {
  if (!path) return 'unknown';

  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'json') return 'json';

  return 'unknown';
}

/**
 * Determines whether the format toolbar should be visible.
 * Shows for markdown files, hides for JSON files.
 */
export function isFormatToolbarVisible(fileType: FileType): boolean {
  return fileType === 'markdown';
}

/**
 * Determines whether the editor should use markdown-specific extensions.
 * True for markdown and unknown (fallback to markdown), false for JSON.
 */
export function isMarkdownMode(fileType: FileType): boolean {
  return fileType !== 'json';
}
