"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";

export function ChatBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (!q) return;
        router.push(`/chat?q=${encodeURIComponent(q)}`);
      }}
      className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 px-4 pb-3 md:sticky md:bottom-0 md:px-0 md:pb-6"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-full border border-border bg-bg py-1.5 pr-1.5 pl-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Chiedi o ricorda qualcosa…"
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-faint"
        />
        <button
          type="submit"
          aria-label="Invia"
          disabled={!value.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg text-bg disabled:opacity-30"
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </form>
  );
}
