import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Client con chiave segreta: salta le RLS. Usarlo solo nei job di sistema (cron). */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
