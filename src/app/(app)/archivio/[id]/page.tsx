import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { Page } from "@/components/page";
import { Badge, SectionTitle } from "@/components/ui";
import { SourceActions } from "@/components/source-actions";

export default async function SourcePage({ params }: PageProps<"/archivio/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: s } = await supabase.from("sources").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();

  const [{ data: chunks }, signed] = await Promise.all([
    supabase.from("chunks").select("chunk_index,page,content").eq("source_id", id).order("chunk_index").limit(400),
    s.storage_path ? supabase.storage.from("sources").createSignedUrl(s.storage_path, 300) : Promise.resolve({ data: null }),
  ]);

  return (
    <Page
      title={s.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>Caricato il {formatDateTime(s.created_at)}</span>
          {s.doc_date && <span>· documento del {formatDate(s.doc_date)}</span>}
          {s.status !== "pronto" && <Badge tone={s.status === "errore" ? "danger" : "accent"}>{s.status}</Badge>}
        </span>
      }
      action={
        <Link href="/archivio" className="mt-1 text-sm text-fg-muted hover:text-fg" aria-label="Torna all'archivio">
          <ArrowLeft size={18} />
        </Link>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {signed.data?.signedUrl && (
          <a
            href={signed.data.signedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] hover:bg-bg-hover"
          >
            <Download size={14} /> Originale
          </a>
        )}
        <SourceActions id={s.id} canRetry={s.status === "errore"} />
      </div>

      {s.error && <p className="mb-6 rounded-lg bg-danger-soft p-3 text-sm text-danger">{s.error}</p>}

      {s.summary && (
        <section className="mb-8">
          <SectionTitle>Riassunto</SectionTitle>
          <p className="text-[15px] leading-relaxed">{s.summary}</p>
          {s.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {s.tags.map((t: string) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <SectionTitle>Testo estratto</SectionTitle>
        <div className="space-y-3">
          {(chunks ?? []).map((c) => (
            <div key={c.chunk_index} id={`c${c.chunk_index}`} className="scroll-mt-6 rounded-lg bg-bg-subtle p-3 target:ring-2 target:ring-accent">
              {c.page && <p className="mb-1 text-[11px] text-fg-faint">pag. {c.page}</p>}
              <p className="text-sm whitespace-pre-wrap text-fg-muted">{c.content}</p>
            </div>
          ))}
        </div>
      </section>
    </Page>
  );
}
