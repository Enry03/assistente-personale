import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODEL } from "@/lib/ai/claude";
import { embed, toPgVector } from "@/lib/ai/embeddings";
import { nowInRomeLabel, romeLocalToIso } from "@/lib/dates";
import { extractText } from "./extract";
import { chunkPages } from "./chunk";

const Analysis = z.object({
  summary: z.string().describe("Riassunto in italiano, 3-6 frasi, con i punti chiave"),
  tags: z.array(z.string()).describe("3-8 tag brevi in minuscolo"),
  doc_date: z.string().nullable().describe("Data del documento in formato YYYY-MM-DD, se presente"),
  action_items: z
    .array(
      z.object({
        title: z.string().describe("Cosa fare, in forma di task breve"),
        due_date: z.string().nullable().describe("Scadenza YYYY-MM-DD se il documento la indica"),
        rationale: z.string().describe("Perché, citando il passaggio del documento"),
      }),
    )
    .describe("Scadenze o azioni concrete per Enrico ricavate dal documento; vuoto se non ce ne sono"),
});

export type ProcessResult = { status: "pronto" | "duplicato" | "errore"; duplicateOf?: string; error?: string };

export async function processSource(supabase: SupabaseClient, sourceId: string): Promise<ProcessResult> {
  const { data: source, error } = await supabase.from("sources").select("*").eq("id", sourceId).single();
  if (error || !source) return { status: "errore", error: "Fonte non trovata" };

  await supabase.from("sources").update({ status: "in_elaborazione", error: null }).eq("id", sourceId);

  try {
    const { data: file, error: dlErr } = await supabase.storage.from("sources").download(source.storage_path);
    if (dlErr || !file) throw new Error("Download non riuscito");
    const buf = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buf).digest("hex");

    // Originale immutabile: se lo stesso file esiste già, si tiene il primo.
    const { data: dup } = await supabase
      .from("sources")
      .select("id")
      .eq("sha256", sha256)
      .neq("id", sourceId)
      .maybeSingle();
    if (dup) {
      await supabase.storage.from("sources").remove([source.storage_path]);
      await supabase.from("sources").delete().eq("id", sourceId);
      return { status: "duplicato", duplicateOf: dup.id };
    }
    await supabase.from("sources").update({ sha256, size_bytes: buf.byteLength }).eq("id", sourceId);

    const pages = await extractText(buf, source.mime_type ?? "", source.title);
    const chunks = chunkPages(pages);
    if (chunks.length === 0) throw new Error("Nessun testo trovato nel file");

    const vectors = await embed(
      chunks.map((c) => `${source.title}\n\n${c.content}`),
      "document",
    );
    await supabase.from("chunks").delete().eq("source_id", sourceId);
    const rows = chunks.map((c, i) => ({
      source_id: sourceId,
      chunk_index: c.index,
      page: c.page,
      content: c.content,
      token_count: Math.ceil(c.content.length / 4),
      embedding: toPgVector(vectors[i]),
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error: insErr } = await supabase.from("chunks").insert(rows.slice(i, i + 100));
      if (insErr) throw new Error(insErr.message);
    }

    const fullText = chunks.map((c) => c.content).join("\n\n").slice(0, 150_000);
    const res = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(Analysis) },
      system:
        "Sei l'archivista personale di Enrico. Analizzi i documenti che carica nel suo archivio. " +
        `Adesso è ${nowInRomeLabel()}. Rispondi in italiano.`,
      messages: [
        {
          role: "user",
          content: `Titolo del file: ${source.title}\n\n<documento>\n${fullText}\n</documento>\n\nAnalizza il documento.`,
        },
      ],
    });
    const analysis = res.parsed_output;
    if (analysis) {
      await supabase
        .from("sources")
        .update({
          summary: analysis.summary,
          tags: analysis.tags.map((t) => t.toLowerCase()).slice(0, 10),
          doc_date: /^\d{4}-\d{2}-\d{2}$/.test(analysis.doc_date ?? "") ? analysis.doc_date : null,
        })
        .eq("id", sourceId);

      if (analysis.action_items.length) {
        await supabase.from("proposals").insert(
          analysis.action_items.slice(0, 5).map((a) => ({
            kind: "crea_task",
            title: a.title,
            rationale: a.rationale,
            source_id: sourceId,
            payload: {
              title: a.title,
              due_at: /^\d{4}-\d{2}-\d{2}$/.test(a.due_date ?? "") ? romeLocalToIso(a.due_date!) : null,
              priority: "media",
              source_id: sourceId,
            },
          })),
        );
      }
    }

    await supabase.from("sources").update({ status: "pronto" }).eq("id", sourceId);
    await supabase.from("activity_log").insert({
      action: "fonte_elaborata",
      target_type: "source",
      target_id: sourceId,
      details: { chunks: chunks.length },
    });
    return { status: "pronto" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("sources").update({ status: "errore", error: message }).eq("id", sourceId);
    return { status: "errore", error: message };
  }
}
