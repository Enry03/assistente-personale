import { getApiUser } from "@/lib/auth";
import { pushConfigured, sendPush } from "@/lib/push";

export async function POST() {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  if (!pushConfigured()) return Response.json({ error: "Chiavi VAPID non configurate" }, { status: 500 });
  const { data: subs } = await user.supabase.from("push_subscriptions").select("endpoint,p256dh,auth");
  let sent = 0;
  for (const s of subs ?? []) {
    const r = await sendPush(s, { title: "Notifiche attive", body: "Riceverai qui i tuoi promemoria.", url: "/" });
    if (r === "gone") await user.supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    else sent++;
  }
  return Response.json({ sent });
}
