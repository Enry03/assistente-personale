import { requireUser } from "@/lib/auth";
import { Page } from "@/components/page";
import { ConversationList } from "@/components/conversation-list";

export const metadata = { title: "Storico chat" };

export default async function HistoryPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(100);
  return (
    <Page title="Conversazioni">
      <ConversationList items={data ?? []} />
    </Page>
  );
}
