import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedQuery, toPgVector } from "./embeddings";

export type SearchHit = {
  chunk_id: string;
  source_id: string;
  source_title: string;
  content: string;
  page: number | null;
  chunk_index: number;
  score: number;
};

/** Ricerca ibrida (full-text italiano + vettori). Rispetta le RLS del chiamante. */
export async function hybridSearch(supabase: SupabaseClient, query: string, count = 8): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  let embedding: number[] | null = null;
  try {
    embedding = await embedQuery(q);
  } catch (e) {
    console.error("Embedding della query non riuscito, uso solo il full-text", e);
  }
  const { data, error } = await supabase.rpc("hybrid_search", {
    query_text: q,
    query_embedding: embedding ? toPgVector(embedding) : null,
    match_count: count,
  });
  if (error) {
    console.error("hybrid_search", error);
    return [];
  }
  return (data ?? []) as SearchHit[];
}
