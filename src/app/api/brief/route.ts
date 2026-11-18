import { getApiUser } from "@/lib/auth";
import { generateBrief } from "@/lib/brief";

export const maxDuration = 120;

export async function POST() {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const content = await generateBrief(user.supabase);
    return Response.json({ content });
  } catch (e) {
    console.error("brief", e);
    return Response.json({ error: "Brief non disponibile" }, { status: 500 });
  }
}
