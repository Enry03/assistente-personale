"use client";

import { useTransition } from "react";
import { Check, Trash2, Bell } from "lucide-react";
import { setTaskStatus, deleteTask } from "@/app/(app)/actions";
import { formatDateTime } from "@/lib/dates";
import { Badge, cn } from "./ui";

export type TaskRow = {
  id: string;
  title: string;
  notes: string | null;
  status: "da_fare" | "in_corso" | "fatto" | "annullato";
  priority: "bassa" | "media" | "alta" | "urgente";
  due_at: string | null;
  project: string | null;
  origin?: string;
  reminders?: { remind_at: string; status: string }[];
};

export function TaskItem({ task, showDelete = false }: { task: TaskRow; showDelete?: boolean }) {
  const [pending, start] = useTransition();
  const done = task.status === "fatto";
  const overdue = !done && task.due_at && new Date(task.due_at) < new Date();
  const nextReminder = task.reminders?.find((r) => r.status === "in_attesa");

  return (
    <div className={cn("group flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-bg-subtle", pending && "opacity-50")}>
      <button
        aria-label={done ? "Segna come da fare" : "Segna come fatto"}
        onClick={() => start(() => setTaskStatus(task.id, done ? "da_fare" : "fatto"))}
        className={cn(
          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
          done ? "border-ok bg-ok text-white" : "border-fg-faint hover:border-fg",
        )}
      >
        {done && <Check size={12} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[15px] leading-snug", done && "text-fg-faint line-through")}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          {task.due_at && <span className={cn(overdue && "font-medium text-danger")}>{formatDateTime(task.due_at)}</span>}
          {(task.priority === "alta" || task.priority === "urgente") && (
            <Badge tone={task.priority === "urgente" ? "danger" : "warn"}>{task.priority}</Badge>
          )}
          {task.project && <Badge>{task.project}</Badge>}
          {nextReminder && (
            <span className="inline-flex items-center gap-0.5">
              <Bell size={11} /> {formatDateTime(nextReminder.remind_at)}
            </span>
          )}
        </div>
        {task.notes && <p className="mt-1 line-clamp-2 text-xs text-fg-faint">{task.notes}</p>}
      </div>
      {showDelete && (
        <button
          aria-label="Elimina"
          onClick={() => start(() => deleteTask(task.id))}
          className="rounded p-1 text-fg-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 max-md:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
