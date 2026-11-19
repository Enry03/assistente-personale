import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { cn } from "./ui";

export function ConversationList({
  items,
  activeId,
}: {
  items: { id: string; title: string; updated_at: string }[];
  activeId?: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <Link href="/chat" className="mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-bg-hover">
        <Plus size={15} /> Nuova chat
      </Link>
      {items.map((c) => (
        <Link
          key={c.id}
          href={`/chat/${c.id}`}
          className={cn(
            "block rounded-md px-2 py-1.5 text-sm hover:bg-bg-hover",
            c.id === activeId ? "bg-bg-hover text-fg" : "text-fg-muted",
          )}
        >
          <span className="block truncate">{c.title}</span>
          <span className="text-[11px] text-fg-faint">{formatDate(c.updated_at)}</span>
        </Link>
      ))}
    </div>
  );
}
