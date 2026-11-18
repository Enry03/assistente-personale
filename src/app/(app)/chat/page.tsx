import { requireUser } from "@/lib/auth";
import { ChatView } from "@/components/chat-view";
import { ChatShell } from "./chat-shell";

export const metadata = { title: "Chat" };

export default async function NewChatPage({ searchParams }: PageProps<"/chat">) {
  const { q } = await searchParams;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(30);
  return (
    <ChatShell conversations={data ?? []}>
      <ChatView key={typeof q === "string" ? q : "new"} conversationId={null} initialMessages={[]} initialQuery={typeof q === "string" ? q : undefined} />
    </ChatShell>
  );
}
