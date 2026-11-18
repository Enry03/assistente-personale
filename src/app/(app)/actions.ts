"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const TaskInput = z.object({
  title: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(5000).optional().nullable(),
  due_at: z.string().optional().nullable(),
  priority: z.enum(["bassa", "media", "alta", "urgente"]).default("media"),
  project: z.string().trim().max(100).optional().nullable(),
  reminder_at: z.string().optional().nullable(),
});

function isoOrNull(v?: string | null) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

async function createTaskWithReminder(input: z.infer<typeof TaskInput>, origin: string, sourceId?: string | null) {
  const { supabase } = await requireUser();
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      notes: input.notes || null,
      due_at: isoOrNull(input.due_at),
      priority: input.priority,
      project: input.project || null,
      origin,
      source_id: sourceId ?? null,
    })
    .select("id,title")
    .single();
  if (error || !task) throw new Error(error?.message ?? "Errore");
  const remindAt = isoOrNull(input.reminder_at);
  if (remindAt) {
    await supabase.from("reminders").insert({ task_id: task.id, title: task.title, remind_at: remindAt });
  }
  await supabase.from("activity_log").insert({ action: "task_creato", target_type: "task", target_id: task.id, details: { origin } });
  return task;
}

/** Form "nuovo task": accetta date locali dal browser già convertite in ISO. */
export async function createTask(formData: FormData) {
  const parsed = TaskInput.safeParse({
    title: formData.get("title"),
    notes: formData.get("notes") || null,
    due_at: formData.get("due_at") || null,
    priority: formData.get("priority") || "media",
    project: formData.get("project") || null,
    reminder_at: formData.get("reminder_at") || null,
  });
  if (!parsed.success) return { error: "Titolo obbligatorio" };
  await createTaskWithReminder(parsed.data, "manuale");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setTaskStatus(id: string, status: "da_fare" | "in_corso" | "fatto" | "annullato") {
  const { supabase } = await requireUser();
  await supabase
    .from("tasks")
    .update({ status, completed_at: status === "fatto" ? new Date().toISOString() : null })
    .eq("id", id);
  if (status === "fatto" || status === "annullato") {
    await supabase.from("reminders").update({ status: "annullato" }).eq("task_id", id).eq("status", "in_attesa");
  }
  revalidatePath("/", "layout");
}

export async function deleteTask(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("tasks").delete().eq("id", id);
  revalidatePath("/", "layout");
}

export async function cancelReminder(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("reminders").update({ status: "annullato" }).eq("id", id);
  revalidatePath("/", "layout");
}

/** Approva o rifiuta una proposta dell'assistente. */
export async function decideProposal(id: string, approve: boolean) {
  const { supabase } = await requireUser();
  const { data: p } = await supabase.from("proposals").select("*").eq("id", id).eq("status", "in_attesa").single();
  if (!p) return { error: "Proposta non trovata" };

  if (!approve) {
    await supabase.from("proposals").update({ status: "rifiutata", decided_at: new Date().toISOString() }).eq("id", id);
    revalidatePath("/", "layout");
    return { ok: true };
  }

  let result: Record<string, unknown> = {};
  const payload = (p.payload ?? {}) as Record<string, string | undefined>;
  if (p.kind === "crea_task") {
    const input = TaskInput.parse({
      title: payload.title ?? p.title,
      notes: payload.notes ?? p.rationale ?? null,
      due_at: payload.due_at ?? null,
      priority: payload.priority ?? "media",
      reminder_at: payload.reminder_at ?? null,
    });
    const task = await createTaskWithReminder(input, p.source_id ? "documento" : "chat", p.source_id);
    result = { task_id: task.id };
  } else if (p.kind === "crea_reminder") {
    const remindAt = isoOrNull(payload.remind_at);
    if (!remindAt) return { error: "Data del promemoria non valida" };
    const { data: r } = await supabase
      .from("reminders")
      .insert({ title: payload.title ?? p.title, body: payload.body ?? null, remind_at: remindAt })
      .select("id")
      .single();
    result = { reminder_id: r?.id };
  } else {
    return { error: `Tipo di proposta non gestito: ${p.kind}` };
  }

  await supabase
    .from("proposals")
    .update({ status: "approvata", decided_at: new Date().toISOString(), result })
    .eq("id", id);
  await supabase.from("activity_log").insert({ action: "proposta_approvata", target_type: "proposal", target_id: id, details: result });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Annulla una proposta già approvata, eliminando ciò che aveva creato. */
export async function undoProposal(id: string) {
  const { supabase } = await requireUser();
  const { data: p } = await supabase.from("proposals").select("*").eq("id", id).eq("status", "approvata").single();
  if (!p) return { error: "Proposta non trovata" };
  const result = (p.result ?? {}) as { task_id?: string; reminder_id?: string };
  if (result.task_id) await supabase.from("tasks").delete().eq("id", result.task_id);
  if (result.reminder_id) await supabase.from("reminders").delete().eq("id", result.reminder_id);
  await supabase.from("proposals").update({ status: "annullata" }).eq("id", id);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteSource(id: string) {
  const { supabase } = await requireUser();
  const { data: s } = await supabase.from("sources").select("storage_path").eq("id", id).single();
  if (s?.storage_path) await supabase.storage.from("sources").remove([s.storage_path]);
  await supabase.from("sources").delete().eq("id", id);
  revalidatePath("/", "layout");
}

export async function deleteConversation(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("conversations").delete().eq("id", id);
  revalidatePath("/chat");
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  const { redirect } = await import("next/navigation");
  redirect("/login");
}
