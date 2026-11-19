import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { anthropic, MODEL, FALLBACK_PARAMS } from "./claude";
import { hybridSearch, type SearchHit } from "./search";
import { nowInRomeLabel, romeDayRange, formatDateTime } from "@/lib/dates";

export type Citation = {
  n: number;
  source_id: string;
  source_title: string;
  chunk_id: string;
  page: number | null;
  cited_text: string;
};

export type StreamEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; text: string }
  | { type: "proposal"; proposal: { id: string; kind: string; title: string } }
  | { type: "done"; messageId: string; content: string; citations: Citation[] }
  | { type: "error"; message: string };

const SYSTEM = `Sei l'assistente personale di Enrico: lo aiuti con lavoro e vita privata.
Parli in italiano, in modo diretto e cordiale, con risposte brevi e concrete.

Regole:
- Quando nel messaggio ci sono documenti del suo archivio, basati su quelli e cita i passaggi usati. Se l'archivio non contiene la risposta, dillo chiaramente invece di inventare.
- Non modifichi mai i dati direttamente. Per creare un task o un promemoria usi gli strumenti propose_task e propose_reminder: creano una proposta che Enrico approva con un tap. Dopo averla creata, dillo in una riga.
- Per sapere cosa ha da fare usa list_tasks.
- Le date che passi agli strumenti sono in formato ISO 8601 con il fuso di Roma (es. 2026-11-20T09:00:00+01:00). Se Enrico non dice l'ora, usa le 09:00.`;

const ListTasksInput = z.object({ filter: z.enum(["aperti", "oggi", "in_ritardo", "fatti_di_recente"]) });
const ProposeTaskInput = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().optional(),
  due_at: z.string().optional(),
  priority: z.enum(["bassa", "media", "alta", "urgente"]).optional(),
  reminder_at: z.string().optional(),
});
const ProposeReminderInput = z.object({ title: z.string().min(1), remind_at: z.string(), body: z.string().optional() });

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "list_tasks",
    description: "Elenca i task di Enrico. filter: aperti (tutti i non completati), oggi (in scadenza oggi), in_ritardo, fatti_di_recente.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { filter: { type: "string", enum: ["aperti", "oggi", "in_ritardo", "fatti_di_recente"] } },
      required: ["filter"],
    },
  },
  {
    name: "propose_task",
    description: "Propone di creare un task. Enrico deve approvarlo. Usa reminder_at se chiede anche di essere avvisato.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titolo breve del task" },
        notes: { type: "string" },
        due_at: { type: "string", description: "Scadenza ISO 8601" },
        priority: { type: "string", enum: ["bassa", "media", "alta", "urgente"] },
        reminder_at: { type: "string", description: "Quando avvisarlo, ISO 8601" },
      },
      required: ["title"],
    },
  },
  {
    name: "propose_reminder",
    description: "Propone un promemoria senza task (es. 'ricordami di chiamare Mario venerdì alle 10').",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        remind_at: { type: "string", description: "ISO 8601" },
        body: { type: "string" },
      },
      required: ["title", "remind_at"],
    },
  },
];

function validIso(s?: string) {
  return !!s && !Number.isNaN(Date.parse(s));
}

async function runTool(
  supabase: SupabaseClient,
  conversationId: string,
  name: string,
  rawInput: unknown,
  emit: (e: StreamEvent) => void,
): Promise<{ content: string; isError?: boolean }> {
  if (name === "list_tasks") {
    const parsed = ListTasksInput.safeParse(rawInput);
    if (!parsed.success) return { content: "Input non valido: " + parsed.error.message, isError: true };
    let q = supabase.from("tasks").select("title,status,priority,due_at,project").limit(50);
    const now = new Date().toISOString();
    const { end } = romeDayRange();
    switch (parsed.data.filter) {
      case "aperti":
        q = q.in("status", ["da_fare", "in_corso"]).order("due_at", { ascending: true, nullsFirst: false });
        break;
      case "oggi":
        q = q.in("status", ["da_fare", "in_corso"]).lt("due_at", end).gte("due_at", now);
        break;
      case "in_ritardo":
        q = q.in("status", ["da_fare", "in_corso"]).lt("due_at", now);
        break;
      case "fatti_di_recente":
        q = q.eq("status", "fatto").order("completed_at", { ascending: false }).limit(20);
        break;
    }
    const { data, error } = await q;
    if (error) return { content: error.message, isError: true };
    if (!data?.length) return { content: "Nessun task." };
    return {
      content: data
        .map((t) => `- ${t.title} [${t.status}, priorità ${t.priority}${t.due_at ? `, scade ${formatDateTime(t.due_at)}` : ""}${t.project ? `, ${t.project}` : ""}]`)
        .join("\n"),
    };
  }

  if (name === "propose_task" || name === "propose_reminder") {
    const schema = name === "propose_task" ? ProposeTaskInput : ProposeReminderInput;
    const parsed = schema.safeParse(rawInput);
    if (!parsed.success) return { content: "Input non valido: " + parsed.error.message, isError: true };
    const input = parsed.data as Record<string, string | undefined>;
    for (const k of ["due_at", "reminder_at", "remind_at"]) {
      if (input[k] !== undefined && !validIso(input[k])) return { content: `${k} non è una data ISO valida`, isError: true };
    }
    const kind = name === "propose_task" ? "crea_task" : "crea_reminder";
    const { data, error } = await supabase
      .from("proposals")
      .insert({ kind, title: input.title!, payload: input, conversation_id: conversationId })
      .select("id,kind,title")
      .single();
    if (error || !data) return { content: error?.message ?? "Errore", isError: true };
    emit({ type: "proposal", proposal: data });
    return { content: "Proposta creata: Enrico la vede con i pulsanti Approva / Rifiuta." };
  }

  return { content: `Strumento sconosciuto: ${name}`, isError: true };
}

function documentsFrom(hits: SearchHit[]): Anthropic.Beta.BetaRequestDocumentBlock[] {
  return hits.map((h) => ({
    type: "document",
    source: { type: "text", media_type: "text/plain", data: h.content },
    title: h.page ? `${h.source_title} (pag. ${h.page})` : h.source_title,
    citations: { enabled: true },
  }));
}

/** Costruisce il testo finale con i rimandi [n] e l'elenco delle citazioni. */
function assemble(turns: Anthropic.Beta.BetaContentBlock[][], hits: SearchHit[]) {
  const citations: Citation[] = [];
  const keyToN = new Map<string, number>();
  let text = "";
  for (const block of turns.flatMap((t, i) => (i > 0 ? [null, ...t] : t))) {
    if (block === null) {
      if (text.trim()) text += "\n\n";
      continue;
    }
    if (block.type !== "text") continue;
    text += block.text;
    const marks = new Set<number>();
    for (const c of block.citations ?? []) {
      if (c.type !== "char_location") continue;
      const hit = hits[c.document_index];
      if (!hit) continue;
      const key = `${hit.chunk_id}`;
      let n = keyToN.get(key);
      if (!n) {
        n = citations.length + 1;
        keyToN.set(key, n);
        citations.push({
          n,
          source_id: hit.source_id,
          source_title: hit.source_title,
          chunk_id: hit.chunk_id,
          page: hit.page,
          cited_text: c.cited_text,
        });
      }
      marks.add(n);
    }
    if (marks.size) text += [...marks].map((n) => ` [${n}]`).join("");
  }
  return { text: text.trim(), citations };
}

export async function runChat(opts: {
  supabase: SupabaseClient;
  conversationId: string;
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  emit: (e: StreamEvent) => void;
}) {
  const { supabase, conversationId, history, userMessage, emit } = opts;

  const [hits, openTasks] = await Promise.all([
    hybridSearch(supabase, userMessage, 8),
    supabase
      .from("tasks")
      .select("title,due_at,priority")
      .in("status", ["da_fare", "in_corso"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(15),
  ]);

  const taskLines = (openTasks.data ?? [])
    .map((t) => `- ${t.title}${t.due_at ? ` (scade ${formatDateTime(t.due_at)})` : ""}${t.priority === "urgente" || t.priority === "alta" ? ` [${t.priority}]` : ""}`)
    .join("\n");

  const context = `Adesso è ${nowInRomeLabel()}.\n\nTask aperti principali:\n${taskLines || "(nessuno)"}`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: [
        ...documentsFrom(hits),
        {
          type: "text",
          text: hits.length
            ? `<contesto>\n${context}\n</contesto>\n\nSopra ci sono i passaggi più pertinenti del mio archivio.\n\n${userMessage}`
            : `<contesto>\n${context}\n</contesto>\n\n${userMessage}`,
        },
      ],
    },
  ];

  let final: Anthropic.Beta.BetaMessage | null = null;
  const turns: Anthropic.Beta.BetaContentBlock[][] = [];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };

  for (let turn = 0; turn < 6; turn++) {
    const stream = anthropic.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK_PARAMS,
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      tools,
      messages,
    });
    stream.on("text", (delta) => emit({ type: "text", text: delta }));

    const msg = await stream.finalMessage();
    usage.input_tokens += msg.usage.input_tokens;
    usage.output_tokens += msg.usage.output_tokens;
    usage.cache_read_input_tokens += msg.usage.cache_read_input_tokens ?? 0;
    final = msg;
    turns.push(msg.content);

    if (msg.stop_reason === "refusal") break;
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: msg.content });
    const toolUses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (t) => {
        const r = await runTool(supabase, conversationId, t.name, t.input, emit);
        return { type: "tool_result" as const, tool_use_id: t.id, content: r.content, is_error: r.isError };
      }),
    );
    messages.push({ role: "user", content: results });
    emit({ type: "text", text: "\n\n" });
  }

  if (!final) throw new Error("Nessuna risposta");
  if (final.stop_reason === "refusal") {
    return { text: "Non posso aiutarti con questa richiesta.", citations: [], usage };
  }
  const { text, citations } = assemble(turns, hits);
  return { text, citations, usage };
}
