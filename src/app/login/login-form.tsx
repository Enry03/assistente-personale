"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Label } from "@/components/ui";

type Step = "loading" | "credentials" | "verify" | "enroll";

export default function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function nextMfaStep() {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") {
      router.replace("/");
      router.refresh();
      return;
    }
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find((f) => f.status === "verified");
    if (verified) {
      setFactorId(verified.id);
      setStep("verify");
      return;
    }
    // Nessuna 2FA ancora: la configuriamo adesso (obbligatoria).
    for (const f of factors?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator" });
    if (error || !data) {
      setError("Impossibile avviare la configurazione 2FA.");
      setStep("credentials");
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStep("enroll");
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nextMfaStep();
      else setStep("credentials");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCredentials(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("Email o password non corretti.");
      return;
    }
    await nextMfaStep();
  }

  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) {
      setError("Codice non valido. Riprova con quello attuale.");
      setCode("");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function onSignOut() {
    await supabase.auth.signOut();
    setStep("credentials");
    setCode("");
  }

  if (step === "loading") return <p className="text-sm text-fg-muted">Un attimo…</p>;

  if (step === "credentials") {
    return (
      <form onSubmit={onCredentials} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Accesso…" : "Continua"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onCode} className="space-y-4">
      {step === "enroll" ? (
        <div className="space-y-3">
          <p className="text-sm">
            Attiva la verifica in due passaggi: inquadra il codice con Google Authenticator, 1Password o un&apos;app simile.
          </p>
          {qr && (
            <div className="flex justify-center rounded-lg border border-border bg-white p-3">
              <img src={qr} alt="Codice QR per la 2FA" className="h-44 w-44" />
            </div>
          )}
          {secret && (
            <p className="break-all text-xs text-fg-muted">
              Oppure inserisci a mano: <span className="font-mono text-fg">{secret}</span>
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm">Inserisci il codice a 6 cifre dell&apos;app di autenticazione.</p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="code">Codice</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="text-center font-mono text-lg tracking-[0.3em]"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Verifica…" : "Verifica"}
      </Button>
      <button type="button" onClick={onSignOut} className="w-full text-center text-sm text-fg-muted hover:text-fg">
        Usa un altro account
      </button>
    </form>
  );
}
