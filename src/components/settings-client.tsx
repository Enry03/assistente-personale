"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Moon, Sun, Monitor, BellRing } from "lucide-react";
import { Button, cn } from "./ui";

type Theme = "light" | "dark" | "system";

const listeners = new Set<() => void>();
function readTheme(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function ThemePicker() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readTheme,
    () => "system" as Theme,
  );

  function apply(t: Theme) {
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
    const resolved = t === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : t;
    window.document.documentElement.setAttribute("data-theme", resolved);
    listeners.forEach((l) => l());
  }

  const opts: { key: Theme; label: string; icon: typeof Sun }[] = [
    { key: "light", label: "Chiaro", icon: Sun },
    { key: "dark", label: "Scuro", icon: Moon },
    { key: "system", label: "Sistema", icon: Monitor },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {opts.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => apply(key)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
            theme === key ? "bg-bg-hover font-medium" : "text-fg-muted",
          )}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushSettings({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<"checking" | "unsupported" | "off" | "on" | "denied">("checking");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function enable() {
    if (!vapidKey) return setMsg("Chiavi VAPID non configurate sul server.");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState("denied");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    setState(res.ok ? "on" : "off");
    setMsg(res.ok ? "Notifiche attivate su questo dispositivo." : "Iscrizione non riuscita.");
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  }

  async function test() {
    const res = await fetch("/api/push/test", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Notifica di prova inviata a ${j.sent} dispositivi.` : j.error ?? "Errore");
  }

  return (
    <div className="space-y-2">
      {state === "unsupported" && (
        <p className="text-sm text-fg-muted">
          Questo browser non supporta le notifiche. Su iPhone aggiungi prima l&apos;app alla schermata Home (Condividi → Aggiungi a Home).
        </p>
      )}
      {state === "denied" && <p className="text-sm text-danger">Notifiche bloccate: riattivale dalle impostazioni del browser.</p>}
      {state === "off" && (
        <Button size="sm" onClick={enable}>
          <BellRing size={14} /> Attiva su questo dispositivo
        </Button>
      )}
      {state === "on" && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={test}>
            Invia una prova
          </Button>
          <Button size="sm" variant="ghost" onClick={disable}>
            Disattiva
          </Button>
        </div>
      )}
      {msg && <p className="text-sm text-fg-muted">{msg}</p>}
    </div>
  );
}
