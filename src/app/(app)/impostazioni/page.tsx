import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { signOut } from "../actions";
import { Page } from "@/components/page";
import { PushSettings, ThemePicker } from "@/components/settings-client";
import { Button, SectionTitle } from "@/components/ui";

export const metadata = { title: "Impostazioni" };

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const { data: user } = await supabase.auth.getUser();
  const factors = user.user?.factors?.filter((f) => f.status === "verified") ?? [];

  return (
    <Page title="Impostazioni">
      <div className="space-y-8">
        <section>
          <SectionTitle>Aspetto</SectionTitle>
          <ThemePicker />
        </section>

        <section>
          <SectionTitle>Notifiche</SectionTitle>
          <p className="mb-2 text-sm text-fg-muted">I promemoria arrivano come notifiche su telefono e computer.</p>
          <PushSettings vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
        </section>

        <section>
          <SectionTitle>Sicurezza</SectionTitle>
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck size={16} className="text-ok" />
            <span>
              {user.user?.email} · verifica in due passaggi attiva ({factors.length} {factors.length === 1 ? "app" : "app"})
            </span>
          </div>
        </section>

        <section>
          <SectionTitle>Account collegati</SectionTitle>
          <p className="text-sm text-fg-muted">Gmail, Outlook e calendari arrivano con la Fase 2.</p>
        </section>

        <form action={signOut}>
          <Button variant="secondary" type="submit">
            Esci
          </Button>
        </form>
      </div>
    </Page>
  );
}
