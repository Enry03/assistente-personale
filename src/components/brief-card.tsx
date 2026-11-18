"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui";

export function BriefCard({ initial }: { initial: string | null }) {
  const [content, setContent] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/brief", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) setError(json.error ?? "Errore");
    else setContent(json.content);
  }

  return (
    <div className="rounded-xl bg-bg-subtle p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-fg-faint">Brief del giorno</p>
        <Button size="sm" variant="ghost" onClick={generate} disabled={loading} aria-label="Aggiorna il brief">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {content ? "Aggiorna" : "Genera"}
        </Button>
      </div>
      {content ? (
        <p className="text-[15px] leading-relaxed">{content}</p>
      ) : (
        <p className="text-sm text-fg-muted">
          {loading ? "Sto preparando il brief…" : "Premi Genera per un riepilogo di cosa conta oggi."}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
