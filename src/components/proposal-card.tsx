"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { decideProposal } from "@/app/(app)/actions";
import { formatDateTime } from "@/lib/dates";
import { Button } from "./ui";

export type ProposalRow = {
  id: string;
  kind: string;
  title: string;
  rationale: string | null;
  payload: Record<string, string | undefined>;
  source_id: string | null;
  sources?: { title: string } | null;
};

const KIND_LABEL: Record<string, string> = { crea_task: "Nuovo task", crea_reminder: "Promemoria" };

export function ProposalCard({ p }: { p: ProposalRow }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const when = p.payload.due_at || p.payload.remind_at || p.payload.reminder_at;

  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideProposal(p.id, approve);
      if (r && "error" in r && r.error) setError(r.error);
    });

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-bg p-3">
      <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-fg-muted">{KIND_LABEL[p.kind] ?? p.kind}</p>
        <p className="text-[15px] font-medium leading-snug">{p.title}</p>
        {when && <p className="mt-0.5 text-xs text-fg-muted">{formatDateTime(when)}</p>}
        {p.rationale && <p className="mt-1 line-clamp-2 text-xs text-fg-faint">{p.rationale}</p>}
        {p.source_id && p.sources && (
          <Link href={`/archivio/${p.source_id}`} className="mt-1 inline-block text-xs text-accent hover:underline">
            da: {p.sources.title}
          </Link>
        )}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => decide(true)} disabled={pending}>
            Approva
          </Button>
          <Button size="sm" variant="ghost" onClick={() => decide(false)} disabled={pending}>
            Rifiuta
          </Button>
        </div>
      </div>
    </div>
  );
}
