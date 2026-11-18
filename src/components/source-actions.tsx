"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Trash2 } from "lucide-react";
import { deleteSource } from "@/app/(app)/actions";
import { Button } from "./ui";

export function SourceActions({ id, canRetry }: { id: string; canRetry: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      {canRetry && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await fetch(`/api/sources/${id}/process`, { method: "POST" });
            setBusy(false);
            router.refresh();
          }}
        >
          <RotateCw size={14} className={busy ? "animate-spin" : ""} /> Riprova
        </Button>
      )}
      {confirm ? (
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await deleteSource(id);
              router.push("/archivio");
            })
          }
        >
          Conferma eliminazione
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          <Trash2 size={14} /> Elimina
        </Button>
      )}
    </>
  );
}
