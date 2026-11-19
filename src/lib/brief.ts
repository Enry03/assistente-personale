import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, MODEL, textOf } from "@/lib/ai/claude";
import { formatDateTime, nowInRomeLabel, romeDayRange, todayInRome } from "@/lib/dates";

/** Scrive il brief di oggi (3-4 righe) e lo salva. */
export async function generateBrief(supabase: SupabaseClient) {
  const now = new Date().toISOString();
  const today = romeDayRange();
  const tomorrow = romeDayRange(undefined, 1);

  const [overdue, dueSoon, reminders, proposals, recent] = await Promise.all([
    supabase.from("tasks").select("title,due_at,priority").in("status", ["da_fare", "in_corso"]).lt("due_at", now).limit(20),
    supabase
      .from("tasks")
      .select("title,due_at,priority")
      .in("status", ["da_fare", "in_corso"])
      .gte("due_at", now)
      .lt("due_at", tomorrow.end)
      .order("due_at")
      .limit(20),
    supabase.from("reminders").select("title,remind_at").eq("status", "in_attesa").gte("remind_at", today.start).lt("remind_at", today.end),
    supabase.from("proposals").select("title").eq("status", "in_attesa").limit(10),
    supabase.from("sources").select("title,summary").order("created_at", { ascending: false }).limit(3),
  ]);

  const fmt = (rows: { title: string; due_at?: string | null; remind_at?: string; priority?: string }[] | null) =>
    (rows ?? [])
      .map((r) => `- ${r.title}${r.due_at ? ` (${formatDateTime(r.due_at)})` : ""}${r.remind_at ? ` (${formatDateTime(r.remind_at)})` : ""}${r.priority && ["alta", "urgente"].includes(r.priority) ? ` [${r.priority}]` : ""}`)
      .join("\n") || "(niente)";

  const input = `Adesso è ${nowInRomeLabel()}.

Task in ritardo:
${fmt(overdue.data)}

Task in scadenza oggi e domani:
${fmt(dueSoon.data)}

Promemoria di oggi:
${fmt(reminders.data)}

Proposte da approvare: ${proposals.data?.length ?? 0}

Ultimi documenti in archivio:
${(recent.data ?? []).map((s) => `- ${s.title}`).join("\n") || "(nessuno)"}`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    system:
      "Sei l'assistente personale di Enrico. Scrivi il brief del giorno: 3-4 frasi in italiano, tono diretto e cordiale, " +
      "su cosa conta oggi, partendo dalla cosa più urgente. Niente elenchi, niente saluti lunghi, niente inventato.",
    messages: [{ role: "user", content: input }],
  });
  const content = textOf(msg.content).trim();
  await supabase.from("briefs").upsert({ brief_date: todayInRome(), content }, { onConflict: "user_id,brief_date" });
  return content;
}
