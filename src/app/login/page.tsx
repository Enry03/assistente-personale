import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Accedi" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg" />
          <div>
            <h1 className="text-lg font-semibold">Assistente</h1>
            <p className="text-sm text-fg-muted">Accesso riservato</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
