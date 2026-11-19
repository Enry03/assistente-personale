import Link from "next/link";
import { History } from "lucide-react";
import { ConversationList } from "@/components/conversation-list";

export function ChatShell({
  conversations,
  activeId,
  children,
}: {
  conversations: { id: string; title: string; updated_at: string }[];
  activeId?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex">
      <div className="min-w-0 flex-1">
        <div className="flex justify-end px-4 pt-3 lg:hidden">
          <Link href="/chat/storico" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
            <History size={15} /> Storico
          </Link>
        </div>
        {children}
      </div>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto border-l border-border px-3 py-4 lg:block">
        <ConversationList items={conversations} activeId={activeId} />
      </aside>
    </div>
  );
}
