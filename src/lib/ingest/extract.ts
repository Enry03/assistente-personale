import "server-only";
import { anthropic, MODEL, textOf } from "@/lib/ai/claude";

export type Page = { page: number | null; text: string };

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** Estrae il testo di un file, pagina per pagina quando possibile. */
export async function extractText(buf: Buffer, mime: string, filename: string): Promise<Page[]> {
  const lower = filename.toLowerCase();

  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(pdf, { mergePages: false });
    const pages = (text as string[]).map((t, i) => ({ page: i + 1, text: t }));
    const total = pages.reduce((n, p) => n + p.text.trim().length, 0);
    // PDF scansionato senza testo: lo legge Claude.
    if (total < 50 && buf.byteLength < 30 * 1024 * 1024) return [{ page: null, text: await readWithClaude(buf, "application/pdf") }];
    return pages;
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return [{ page: null, text: value }];
  }

  if ((IMAGE_TYPES as readonly string[]).includes(mime)) {
    return [{ page: null, text: await readWithClaude(buf, mime as ImageType) }];
  }

  if (mime.startsWith("text/") || /\.(md|txt|csv|json|html?)$/.test(lower)) {
    return [{ page: null, text: buf.toString("utf8") }];
  }

  throw new Error(`Formato non supportato: ${mime || lower}`);
}

/** Trascrive un'immagine o un PDF scansionato con Claude. */
async function readWithClaude(buf: Buffer, mime: ImageType | "application/pdf"): Promise<string> {
  const data = buf.toString("base64");
  const block =
    mime === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: mime, data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mime, data } } as const);
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          block,
          {
            type: "text",
            text:
              "Trascrivi fedelmente tutto il testo presente. Se è una foto senza testo, descrivila in modo utile per ritrovarla con una ricerca. Rispondi solo con la trascrizione o la descrizione, in italiano se il contenuto non è in un'altra lingua.",
          },
        ],
      },
    ],
  });
  const msg = await stream.finalMessage();
  return textOf(msg.content);
}
