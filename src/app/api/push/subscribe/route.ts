import { z } from "zod";
import { getApiUser } from "@/lib/auth";

const Body = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export async function POST(req: Request) {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Iscrizione non valida" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const { error } = await user.supabase.from("push_subscriptions").upsert(
    { endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: req.headers.get("user-agent") },
    { onConflict: "endpoint" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await user.supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return Response.json({ ok: true });
}
