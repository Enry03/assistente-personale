"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Sparkles, FileText } from "lucide-react";
import type { Citation, StreamEvent } from "@/lib/ai/assistant";
import { cn } from "./ui";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  proposals?: { id: string; kind: string; title: string }[];
  pending?: boolean;
};

const SUGGESTIONS = ["Cosa ho da fare oggi?", "Ricordami di chiamare il commercialista venerdì alle 10", "Cerca nei miei documenti il contratto d'affitto"];

export function ChatView({
  conversationId: initialId,
  initialMessages,
  initialQuery,
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  initialQuery?: string;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (initialQuery && !started.current) {
      started.current = true;
      send(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setInput("");
    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", content: message },
      { id: assistantId, role: "assistant", content: "", pending: true, proposals: [] },
    ]);
    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((ms) => ms.map((m) => (m.id === assistantId ? fn(m) : m)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message }),
      });
      if (!res.ok || !res.body) throw new Error("Errore di rete");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let newId: string | null = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as StreamEvent;
          if (ev.type === "conversation") {
            if (!conversationId) newId = ev.id;
            setConversationId(ev.id);
          } else if (ev.type === "text") patch((m) => ({ ...m, content: m.content + ev.text }));
          else if (ev.type === "proposal") patch((m) => ({ ...m, proposals: [...(m.proposals ?? []), ev.proposal] }));
          else if (ev.type === "done") patch((m) => ({ ...m, content: ev.content, citations: ev.citations, pending: false }));
          else if (ev.type === "error") patch((m) => ({ ...m, content: ev.message, pending: false }));
        }
      }
      if (newId) router.replace(`/chat/${newId}`, { scroll: false });
    } catch {
      patch((m) => ({ ...m, content: "Non riesco a raggiungere l'assistente. Riprova.", pending: false }));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-80px)] flex-col md:min-h-dvh">
      <div className="flex-1 space-y-6 px-4 pt-6 pb-4 sm:px-8">
        {messages.length === 0 && (
          <div className="mx-auto max-w-2xl pt-10 text-center">
            <Sparkles className="mx-auto mb-3 text-accent" size={22} />
            <h1 className="text-xl font-semibold">Come posso aiutarti?</h1>
            <p className="mt-1 text-sm text-fg-muted">Conosco i tuoi task e i documenti dell&apos;archivio.</p>
            <div className="mt-6 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-bg-subtle">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="mx-auto max-w-2xl">
            {m.role === "user" ? (
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl bg-bg-hover px-3.5 py-2 text-[15px] whitespace-pre-wrap">{m.content}</p>
              </div>
            ) : (
              <div>
                <div className="prose-chat text-[15px] leading-relaxed">
                  {m.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  ) : (
                    <span className="inline-flex gap-1 text-fg-faint">
                      <span className="animate-pulse">●</span>
                      <span className="animate-pulse [animation-delay:150ms]">●</span>
                      <span className="animate-pulse [animation-delay:300ms]">●</span>
                    </span>
                  )}
                </div>
                {m.proposals && m.proposals.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.proposals.map((p) => (
                      <Link key={p.id} href="/" className="flex items-center gap-2 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent">
                        <Sparkles size={14} />
                        Proposta: {p.title} · approvala da Oggi
                      </Link>
                    ))}
                  </div>
                )}
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-border pt-2">
                    {m.citations.map((c) => (
                      <Link
                        key={c.n}
                        href={`/archivio/${c.source_id}`}
                        className="flex items-start gap-2 rounded px-1 py-1 text-xs text-fg-muted hover:bg-bg-subtle"
                        title={c.cited_text}
                      >
                        <span className="font-mono text-fg-faint">[{c.n}]</span>
                        <FileText size={12} className="mt-0.5 shrink-0" />
                        <span className="min-w-0">
                          <span className="text-fg">{c.source_title}</span>
                          {c.page ? ` · pag. ${c.page}` : ""}
                          <span className="block line-clamp-1 italic">“{c.cited_text.trim()}”</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-[calc(56px+env(safe-area-inset-bottom))] bg-gradient-to-t from-bg via-bg to-transparent px-4 pt-4 pb-3 sm:px-8 md:bottom-0 md:pb-6"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-border bg-bg py-1.5 pr-1.5 pl-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Scrivi un messaggio…"
            className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-fg-faint"
          />
          <button
            type="submit"
            aria-label="Invia"
            disabled={busy || !input.trim()}
            className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg text-bg disabled:opacity-30")}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
