import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Restituisce client e utente; reindirizza al login se manca la sessione con 2FA. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || claims.aal !== "aal2") redirect("/login");
  return { supabase, userId: claims.sub as string };
}

/** Variante per le API: nessun redirect, restituisce null se non autorizzato. */
export async function getApiUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || claims.aal !== "aal2") return null;
  return { supabase, userId: claims.sub as string };
}
