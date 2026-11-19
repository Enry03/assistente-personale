import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured, sendPush } from "@/lib/push";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Chiamato da pg_cron ogni 5 minuti: invia i reminder scaduti. */
export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  if (!pushConfigured()) return Response.json({ error: "Push non configurate" }, { status: 500 });

  const db = createAdminClient();
  const { data: due, error } = await db
    .from("reminders")
    .select("id,user_id,title,body,task_id")
    .eq("status", "in_attesa")
    .lte("remind_at", new Date().toISOString())
    .limit(50);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const r of due ?? []) {
    const { data: subs } = await db.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", r.user_id);
    let delivered = false;
    let lastError: string | null = null;
    for (const s of subs ?? []) {
      try {
        const res = await sendPush(s, { title: r.title, body: r.body ?? undefined, url: r.task_id ? "/task" : "/" });
        if (res === "gone") await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        else delivered = true;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    await db
      .from("reminders")
      .update(
        delivered
          ? { status: "inviato", sent_at: new Date().toISOString(), error: null }
          : { status: "errore", error: lastError ?? "Nessun dispositivo iscritto alle notifiche" },
      )
      .eq("id", r.id);
    if (delivered) sent++;
  }
  return Response.json({ checked: due?.length ?? 0, sent });
}
