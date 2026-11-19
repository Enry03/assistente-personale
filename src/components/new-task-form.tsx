"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createTask } from "@/app/(app)/actions";
import { Button, Input, Label, Textarea } from "./ui";

function toIso(local: FormDataEntryValue | null) {
  if (!local || typeof local !== "string") return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function NewTaskForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("due_at", toIso(fd.get("due_at")));
    fd.set("reminder_at", toIso(fd.get("reminder_at")));
    start(async () => {
      const r = await createTask(fd);
      if (r?.error) setError(r.error);
      else {
        ref.current?.reset();
        setError(null);
        setOpen(false);
      }
    });
  }

  return (
    <form ref={ref} onSubmit={onSubmit} className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <Plus size={16} className="shrink-0 text-fg-faint" />
        <input
          name="title"
          required
          placeholder="Nuovo task…"
          onFocus={() => setOpen(true)}
          className="h-8 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-faint"
        />
        {!open && (
          <Button size="sm" type="submit" disabled={pending}>
            Aggiungi
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <Textarea name="notes" rows={2} placeholder="Note (facoltative)" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="due_at">Scadenza</Label>
              <Input id="due_at" name="due_at" type="datetime-local" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reminder_at">Avvisami</Label>
              <Input id="reminder_at" name="reminder_at" type="datetime-local" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="priority">Priorità</Label>
              <select
                id="priority"
                name="priority"
                defaultValue="media"
                className="h-9 w-full rounded-md border border-border bg-bg px-2 text-sm outline-none focus:border-accent"
              >
                <option value="bassa">Bassa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="project">Progetto</Label>
              <Input id="project" name="project" placeholder="es. Lavoro, Casa" />
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Chiudi
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Salvo…" : "Aggiungi"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
