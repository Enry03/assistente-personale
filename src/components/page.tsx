export function Page({ title, subtitle, action, children }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-10 sm:px-8 sm:pt-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </main>
  );
}
