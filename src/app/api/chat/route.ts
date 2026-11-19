import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { runChat, type StreamEvent } from "@/lib/ai/assistant";

export const maxDuration = 300;

const Body = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(20_000),
});

export async function POST(req: Request) {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Richiesta non valida" }, { status: 400 });
  const { supabase } = user;
  const { message } = parsed.data;

  let conversationId = parsed.data.conversationId ?? null;
  if (!conversationId) {
    const title = message.length > 60 ? message.slice(0, 57) + "…" : message;
    const { data, error } = await supabase.from("conversations").insert({ title }).select("id").single();
    if (error || !data) return Response.json({ error: "Impossibile creare la conversazione" }, { status: 500 });
    conversationId = data.id as string;
  }

  const { data: prev } = await supabase
    .from("messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);
  const history = (prev ?? []).reverse() as { role: "user" | "assistant"; content: string }[];

  await supabase.from("messages").insert({ conversation_id: conversationId, role: "user", content: message });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      emit({ type: "conversation", id: conversationId! });
      try {
        const result = await runChat({ supabase, conversationId: conversationId!, history, userMessage: message, emit });
        const { data: saved } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant",
            content: result.text,
            citations: result.citations,
            usage: result.usage,
          })
          .select("id")
          .single();
        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
        emit({ type: "done", messageId: saved?.id ?? "", content: result.text, citations: result.citations });
      } catch (e) {
        console.error("chat", e);
        emit({ type: "error", message: "Qualcosa è andato storto. Riprova tra poco." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
