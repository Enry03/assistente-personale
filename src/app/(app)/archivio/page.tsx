import Link from "next/link";
import { FileText, Search, StickyNote, Image as ImageIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { hybridSearch } from "@/lib/ai/search";
import { formatDate } from "@/lib/dates";
import { Page } from "@/components/page";
import { Uploader } from "@/components/uploader";
import { Badge, Empty, SectionTitle } from "@/components/ui";

export const metadata = { title: "Archivio" };

const STATUS_TONE = { caricato: "neutral", in_elaborazione: "accent", pronto: "ok", errore: "danger" } as const;

export default async function ArchivePage({ searchParams }: PageProps<"/archivio">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const { supabase, userId } = await requireUser();

  const [sources, hits] = await Promise.all([
    supabase
      .from("sources")
      .select("id,title,kind,mime_type,status,summary,tags,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    query ? hybridSearch(supabase, query, 12) : Promise.resolve([]),
  ]);

  return (
    <Page title="Archivio" subtitle="Tutto quello che carichi qui l'assistente lo legge, lo riassume e lo usa per risponderti.">
      <Uploader userId={userId} />

      <form className="mt-8 flex items-center gap-2 rounded-lg border border-border px-3" action="/archivio">
        <Search size={15} className="text-fg-faint" />
        <input
          name="q"
          defaultValue={query}
          placeholder="Cerca nei documenti (anche per significato)…"
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-faint"
        />
      </form>

      {query && (
        <section className="mt-6">
          <SectionTitle>Risultati per “{query}”</SectionTitle>
          {hits.length ? (
            <ul className="space-y-2">
              {hits.map((h) => (
                <li key={h.chunk_id}>
                  <Link href={`/archivio/${h.source_id}#c${h.chunk_index}`} className="block rounded-lg border border-border p-3 hover:bg-bg-subtle">
                    <p className="text-sm font-medium">
                      {h.source_title}
                      {h.page ? <span className="font-normal text-fg-muted"> · pag. {h.page}</span> : null}
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm text-fg-muted">{h.content}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nessun risultato.</Empty>
          )}
        </section>
      )}

      <section className="mt-8">
        <SectionTitle>Documenti</SectionTitle>
        {sources.data?.length ? (
          <ul className="-mx-2">
            {sources.data.map((s) => {
              const Icon = s.kind === "nota" ? StickyNote : s.mime_type?.startsWith("image/") ? ImageIcon : FileText;
              return (
                <li key={s.id}>
                  <Link href={`/archivio/${s.id}`} className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-bg-subtle">
                    <Icon size={16} className="mt-0.5 shrink-0 text-fg-faint" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px]">{s.title}</span>
                        {s.status !== "pronto" && <Badge tone={STATUS_TONE[s.status as keyof typeof STATUS_TONE]}>{s.status.replace("_", " ")}</Badge>}
                      </div>
                      {s.summary && <p className="mt-0.5 line-clamp-1 text-xs text-fg-muted">{s.summary}</p>}
                      {s.tags?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {s.tags.slice(0, 4).map((t: string) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-fg-faint">{formatDate(s.created_at)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>Ancora nessun documento.</Empty>
        )}
      </section>
    </Page>
  );
}
