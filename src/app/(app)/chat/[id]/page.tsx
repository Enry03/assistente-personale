import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ChatView, type ChatMessage } from "@/components/chat-view";
import { ChatShell } from "../chat-shell";

export const metadata = { title: "Chat" };

export default async function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: conv }, { data: msgs }, { data: list }] = await Promise.all([
    supabase.from("conversations").select("id").eq("id", id).maybeSingle(),
    supabase.from("messages").select("id,role,content,citations").eq("conversation_id", id).order("created_at").limit(200),
    supabase.from("conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(30),
  ]);
  if (!conv) notFound();
  return (
    <ChatShell conversations={list ?? []} activeId={id}>
      <ChatView key={id} conversationId={id} initialMessages={(msgs ?? []) as ChatMessage[]} />
    </ChatShell>
  );
}
