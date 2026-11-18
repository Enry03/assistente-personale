import "server-only";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = process.env.VOYAGE_MODEL || "voyage-3.5";
export const EMBEDDING_DIM = 1024;

type InputType = "document" | "query";

/** Calcola gli embedding con Voyage AI, a gruppi per restare nei limiti dell'API. */
export async function embed(texts: string[], inputType: InputType): Promise<number[][]> {
  if (!process.env.VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY mancante");
  const out: number[][] = [];
  const batchSize = 64;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        input: batch,
        model: MODEL,
        input_type: inputType,
        output_dimension: EMBEDDING_DIM,
      }),
    });
    if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    json.data.sort((a, b) => a.index - b.index).forEach((d) => out.push(d.embedding));
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embed([text], "query");
  return v;
}

/** pgvector accetta il formato testuale "[1,2,3]". */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
