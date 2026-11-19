import { getApiUser } from "@/lib/auth";
import { processSource } from "@/lib/ingest/process";

export const maxDuration = 300;

export async function POST(_req: Request, ctx: RouteContext<"/api/sources/[id]/process">) {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await ctx.params;
  const result = await processSource(user.supabase, id);
  return Response.json(result, { status: result.status === "errore" ? 500 : 200 });
}
