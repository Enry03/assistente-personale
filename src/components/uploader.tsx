"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, StickyNote } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Textarea, Input } from "./ui";

type Item = { name: string; state: "caricamento" | "analisi" | "fatto" | "duplicato" | "errore"; message?: string };

const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.json,.html,image/png,image/jpeg,image/webp,image/gif";

function safeName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120);
}

export function Uploader({ userId }: { userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");

  const update = (name: string, patch: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.name === name ? { ...x, ...patch } : x)));

  async function ingest(file: File, title = file.name, kind = "file") {
    setItems((xs) => [...xs.filter((x) => x.name !== file.name), { name: file.name, state: "caricamento" }]);
    const { data: src, error } = await supabase
      .from("sources")
      .insert({ title, kind, mime_type: file.type || null, size_bytes: file.size })
      .select("id")
      .single();
    if (error || !src) return update(file.name, { state: "errore", message: error?.message });

    const path = `${userId}/${src.id}/${safeName(file.name)}`;
    const up = await supabase.storage.from("sources").upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (up.error) {
      await supabase.from("sources").delete().eq("id", src.id);
      return update(file.name, { state: "errore", message: up.error.message });
    }
    await supabase.from("sources").update({ storage_path: path }).eq("id", src.id);

    update(file.name, { state: "analisi" });
    const res = await fetch(`/api/sources/${src.id}/process`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (json.status === "duplicato") update(file.name, { state: "duplicato", message: "Già presente in archivio" });
    else if (!res.ok) update(file.name, { state: "errore", message: json.error });
    else update(file.name, { state: "fatto" });
    router.refresh();
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) await ingest(f);
  }

  async function saveNote() {
    const text = noteText.trim();
    if (!text) return;
    const title = noteTitle.trim() || text.split("\n")[0].slice(0, 60);
    const file = new File([`# ${title}\n\n${text}`], `${safeName(title) || "nota"}.md`, { type: "text/markdown" });
    setNoteOpen(false);
    setNoteText("");
    setNoteTitle("");
    await ingest(file, title, "nota");
  }

  const labels: Record<Item["state"], string> = {
    caricamento: "Caricamento…",
    analisi: "L'assistente lo sta leggendo…",
    fatto: "Pronto",
    duplicato: "Già presente",
    errore: "Errore",
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors ${drag ? "border-accent bg-accent-soft" : "border-border"}`}
      >
        <p className="text-sm text-fg-muted">Trascina qui PDF, Word, testi o foto, oppure</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => input.current?.click()}>
            <Upload size={14} /> Scegli file
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setNoteOpen((v) => !v)}>
            <StickyNote size={14} /> Scrivi una nota
          </Button>
        </div>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>

      {noteOpen && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <Input placeholder="Titolo (facoltativo)" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
          <Textarea rows={5} placeholder="Scrivi qui…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          <div className="flex justify-end">
            <Button size="sm" onClick={saveNote} disabled={!noteText.trim()}>
              Salva nota
            </Button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-1 text-sm">
          {items.map((i) => (
            <li key={i.name} className="flex items-center justify-between gap-3 rounded-md bg-bg-subtle px-3 py-2">
              <span className="truncate">{i.name}</span>
              <span className={i.state === "errore" ? "text-danger" : i.state === "fatto" ? "text-ok" : "text-fg-muted"}>
                {labels[i.state]}
                {i.message && i.state === "errore" ? `: ${i.message}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
