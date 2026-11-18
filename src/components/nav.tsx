"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, MessageSquare, CheckSquare, Archive, Settings, Mail, Calendar, BookUser } from "lucide-react";
import { cn } from "./ui";

const MAIN = [
  { href: "/", label: "Oggi", icon: Sun },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/task", label: "Task", icon: CheckSquare },
  { href: "/archivio", label: "Archivio", icon: Archive },
];

const SOON = [
  { label: "Posta", icon: Mail },
  { label: "Agenda", icon: Calendar },
  { label: "Schede", icon: BookUser },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-bg-subtle px-3 py-4 md:flex">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
        <img src="/icon.svg" alt="" className="h-7 w-7 rounded-md" />
        <span className="text-[15px] font-semibold">Assistente</span>
      </Link>
      <nav className="space-y-0.5">
        {MAIN.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
              isActive(path, href) ? "bg-bg-hover font-medium text-fg" : "text-fg-muted hover:bg-bg-hover hover:text-fg",
            )}
          >
            <Icon size={16} strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </nav>
      <p className="mt-6 mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">In arrivo</p>
      <div className="space-y-0.5">
        {SOON.map(({ label, icon: Icon }) => (
          <div key={label} className="flex items-center gap-2.5 px-2 py-1.5 text-sm text-fg-faint">
            <Icon size={16} strokeWidth={1.8} />
            {label}
          </div>
        ))}
      </div>
      <div className="mt-auto">
        <Link
          href="/impostazioni"
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
            isActive(path, "/impostazioni") ? "bg-bg-hover font-medium text-fg" : "text-fg-muted hover:bg-bg-hover hover:text-fg",
          )}
        >
          <Settings size={16} strokeWidth={1.8} />
          Impostazioni
        </Link>
      </div>
    </aside>
  );
}

export function BottomNav() {
  const path = usePathname();
  const items = [...MAIN, { href: "/impostazioni", label: "Altro", icon: Settings }];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[11px]",
              isActive(path, href) ? "text-fg" : "text-fg-faint",
            )}
          >
            <Icon size={20} strokeWidth={isActive(path, href) ? 2.2 : 1.8} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
