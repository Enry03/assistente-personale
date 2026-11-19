import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { romeDayRange } from "@/lib/dates";
import { Page } from "@/components/page";
import { NewTaskForm } from "@/components/new-task-form";
import { TaskItem, type TaskRow } from "@/components/task-item";
import { Empty, cn } from "@/components/ui";

export const metadata = { title: "Task" };

const FILTERS = [
  { key: "aperti", label: "Aperti" },
  { key: "oggi", label: "Oggi" },
  { key: "ritardo", label: "In ritardo" },
  { key: "fatti", label: "Fatti" },
] as const;

export default async function TasksPage({ searchParams }: PageProps<"/task">) {
  const { f } = await searchParams;
  const filter = (FILTERS.find((x) => x.key === f)?.key ?? "aperti") as (typeof FILTERS)[number]["key"];
  const { supabase } = await requireUser();
  const now = new Date().toISOString();
  const today = romeDayRange();

  let q = supabase.from("tasks").select("id,title,notes,status,priority,due_at,project,origin,reminders(remind_at,status)");
  if (filter === "fatti") q = q.eq("status", "fatto").order("completed_at", { ascending: false }).limit(50);
  else {
    q = q.in("status", ["da_fare", "in_corso"]);
    if (filter === "oggi") q = q.gte("due_at", today.start).lt("due_at", today.end);
    if (filter === "ritardo") q = q.lt("due_at", now);
    q = q.order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(200);
  }
  const { data } = await q;
  const tasks = (data ?? []) as TaskRow[];

  return (
    <Page title="Task e promemoria">
      <NewTaskForm />
      <div className="mt-6 mb-3 flex gap-1 overflow-x-auto">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "aperti" ? "/task" : `/task?f=${x.key}`}
            className={cn(
              "rounded-full px-3 py-1 text-sm whitespace-nowrap",
              filter === x.key ? "bg-fg text-bg" : "text-fg-muted hover:bg-bg-hover",
            )}
          >
            {x.label}
          </Link>
        ))}
      </div>
      {tasks.length ? (
        <div className="-mx-2">{tasks.map((t) => <TaskItem key={t.id} task={t} showDelete />)}</div>
      ) : (
        <Empty>Nessun task qui.</Empty>
      )}
    </Page>
  );
}
