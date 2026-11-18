import type { Page } from "./extract";

export type Chunk = { index: number; page: number | null; content: string };

const TARGET = 1500; // caratteri per blocco
const OVERLAP = 200;

/** Divide il testo in blocchi di ~1500 caratteri, preferendo i confini di paragrafo. */
export function chunkPages(pages: Page[]): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  for (const { page, text } of pages) {
    const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!clean) continue;
    let start = 0;
    while (start < clean.length) {
      let end = Math.min(start + TARGET, clean.length);
      if (end < clean.length) {
        const slice = clean.slice(start, end);
        const breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
        if (breakAt > TARGET * 0.5) end = start + breakAt + 1;
      }
      const content = clean.slice(start, end).trim();
      if (content) chunks.push({ index: index++, page, content });
      if (end >= clean.length) break;
      start = Math.max(end - OVERLAP, start + 1);
    }
  }
  return chunks;
}
