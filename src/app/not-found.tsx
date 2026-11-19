import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-lg font-semibold">Pagina non trovata</p>
      <Link href="/" className="text-sm text-accent hover:underline">
        Torna a Oggi
      </Link>
    </main>
  );
}
