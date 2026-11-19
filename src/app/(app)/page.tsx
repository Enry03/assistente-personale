import Link from "next/link";
import { FileText, Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { romeDayRange, todayInRome, formatDateTime, formatDate, TZ } from "@/lib/dates";
import { BriefCard } from "@/components/brief-card";
import { ProposalCard, type ProposalRow } from "@/components/proposal-card";
import { TaskItem, type TaskRow } from "@/components/task-item";
import { ChatBar } from "@/components/chat-bar";
import { SectionTitle, Empty } from "@/components/ui";

export const metadata = { title: "Oggi" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("it-IT", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date()));
  if (h < 13) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export default async function TodayPage() {
  const { supabase } = await requireUser();
  const now = new Date().toISOString();
  const today = romeDayRange();
  const week = romeDayRange(undefined, 7);
  const taskCols = "id,title,notes,status,priority,due_at,project,reminders(remind_at,status)";

  const [profile, brief, proposals, overdue, dueSoon, noDate, reminders, sources] = await Promise.all([
    supabase.from("profiles").select("display_name").maybeSingle(),
    supabase.from("briefs").select("content").eq("brief_date", todayInRome()).maybeSingle(),
    supabase
      .from("proposals")
      .select("id,kind,title,rationale,payload,source_id,sources(title)")
      .eq("status", "in_attesa")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("tasks").select(taskCols).in("status", ["da_fare", "in_corso"]).lt("due_at", now).order("due_at").limit(20),
    supabase
      .from("tasks")
      .select(taskCols)
      .in("status", ["da_fare", "in_corso"])
      .gte("due_at", now)
      .lt("due_at", week.end)
      .order("due_at")
      .limit(20),
    supabase
      .from("tasks")
      .select(taskCols)
      .in("status", ["da_fare", "in_corso"])
      .is("due_at", null)
      .in("priority", ["alta", "urgente"])
      .limit(10),
    supabase
      .from("reminders")
      .select("id,title,remind_at")
      .eq("status", "in_attesa")
      .is("task_id", null)
      .gte("remind_at", today.start)
      .lt("remind_at", today.end)
      .order("remind_at"),
    supabase.from("sources").select("id,title,created_at,status").order("created_at", { ascending: false }).limit(4),
  ]);

  const name = profile.data?.display_name;
  const urgent = [...(overdue.data ?? []), ...(noDate.data ?? [])] as TaskRow[];
  const upcoming = (dueSoon.data ?? []) as TaskRow[];
  const dateLabel = new Intl.DateTimeFormat("it-IT", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-8 sm:pt-10">
      <header className="mb-6">
        <p className="text-sm capitalize text-fg-muted">{dateLabel}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}
          {name ? `, ${name}` : ""}
        </h1>
      </header>

      <div className="space-y-8 pb-28 md:pb-8">
        <BriefCard initial={brief.data?.content ?? null} />

        {(proposals.data?.length ?? 0) > 0 && (
          <section>
            <SectionTitle>Proposte dell&apos;assistente</SectionTitle>
            <div className="space-y-2">
              {(proposals.data as unknown as ProposalRow[]).map((p) => (
                <ProposalCard key={p.id} p={p} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle action={<Link href="/task" className="text-xs text-fg-muted hover:text-fg">Tutti i task</Link>}>
            Urgenti e in ritardo
          </SectionTitle>
          {urgent.length ? (
            <div className="-mx-2">{urgent.map((t) => <TaskItem key={t.id} task={t} />)}</div>
          ) : (
            <Empty>Niente di urgente. Ottimo.</Empty>
          )}
        </section>

        <section>
          <SectionTitle>Prossimi 7 giorni</SectionTitle>
          {upcoming.length ? (
            <div className="-mx-2">{upcoming.map((t) => <TaskItem key={t.id} task={t} />)}</div>
          ) : (
            <Empty>Nessuna scadenza in arrivo.</Empty>
          )}
        </section>

        {(reminders.data?.length ?? 0) > 0 && (
          <section>
            <SectionTitle>Promemoria di oggi</SectionTitle>
            <ul className="space-y-1">
              {reminders.data!.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-2 py-1.5 text-[15px]">
                  <Bell size={14} className="text-fg-faint" />
                  <span className="flex-1">{r.title}</span>
                  <span className="text-xs text-fg-muted">{formatDateTime(r.remind_at, { day: undefined, month: undefined })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <SectionTitle action={<Link href="/archivio" className="text-xs text-fg-muted hover:text-fg">Archivio</Link>}>
            Documenti recenti
          </SectionTitle>
          {sources.data?.length ? (
            <ul className="-mx-2">
              {sources.data.map((s) => (
                <li key={s.id}>
                  <Link href={`/archivio/${s.id}`} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-bg-subtle">
                    <FileText size={15} className="shrink-0 text-fg-faint" />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{s.title}</span>
                    <span className="text-xs text-fg-faint">{formatDate(s.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              Carica il primo documento dall&apos;<Link href="/archivio" className="text-accent hover:underline">archivio</Link>.
            </Empty>
          )}
        </section>
      </div>

      <ChatBar />
    </main>
  );
}
