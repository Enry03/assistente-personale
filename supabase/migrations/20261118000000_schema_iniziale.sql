-- Schema iniziale dell'assistente personale.
-- Fase 1 usa: profiles, tasks, reminders, sources, chunks, conversations,
-- messages, proposals, push_subscriptions, activity_log.
-- Le tabelle delle fasi 2-3 sono create subito per non dover rifare lo schema.

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Accesso riservato al proprietario
-- ---------------------------------------------------------------------------
-- private.app_config contiene l'email del proprietario (inserita a mano, non nel repo).
create table private.app_config (
  key text primary key,
  value text not null
);

-- Blocca la creazione di qualsiasi utente che non sia il proprietario.
create or replace function private.only_owner_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
begin
  select value into owner_email from private.app_config where key = 'owner_email';
  if owner_email is null or lower(new.email) <> lower(owner_email) then
    raise exception 'Registrazione non consentita';
  end if;
  return new;
end;
$$;

create trigger only_owner_signup
  before insert on auth.users
  for each row execute function private.only_owner_signup();

-- Tipi enumerati ------------------------------------------------------------
create type public.task_status as enum ('da_fare', 'in_corso', 'fatto', 'annullato');
create type public.task_priority as enum ('bassa', 'media', 'alta', 'urgente');
create type public.item_origin as enum ('manuale', 'chat', 'documento', 'mail', 'calendario', 'sistema');
create type public.reminder_channel as enum ('push', 'email', 'telegram');
create type public.reminder_status as enum ('in_attesa', 'inviato', 'errore', 'annullato');
create type public.source_status as enum ('caricato', 'in_elaborazione', 'pronto', 'errore');
create type public.proposal_status as enum ('in_attesa', 'approvata', 'rifiutata', 'annullata');
create type public.message_role as enum ('user', 'assistant');
create type public.entity_kind as enum ('persona', 'progetto', 'cliente', 'tema', 'luogo', 'altro');

-- Funzione comune per updated_at --------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- FASE 1
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Rome',
  brief_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(title) between 1 and 500),
  notes text,
  status public.task_status not null default 'da_fare',
  priority public.task_priority not null default 'media',
  due_at timestamptz,
  project text,
  origin public.item_origin not null default 'manuale',
  source_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_status_due_idx on public.tasks (user_id, status, due_at);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  title text not null,
  body text,
  remind_at timestamptz not null,
  channel public.reminder_channel not null default 'push',
  status public.reminder_status not null default 'in_attesa',
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index reminders_user_idx on public.reminders (user_id);
create index reminders_task_idx on public.reminders (task_id);
create index reminders_pending_idx on public.reminders (remind_at) where status = 'in_attesa';

-- Fonti: l'originale è immutabile (file in Storage + hash SHA-256).
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  kind text not null default 'file', -- file, nota, mail, pagina_web, audio
  mime_type text,
  storage_path text,
  size_bytes bigint,
  sha256 text,
  status public.source_status not null default 'caricato',
  summary text,
  tags text[] not null default '{}',
  doc_date date,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sha256)
);
create index sources_user_created_idx on public.sources (user_id, created_at desc);
create index sources_tags_idx on public.sources using gin (tags);

alter table public.tasks
  add constraint tasks_source_fk foreign key (source_id) references public.sources (id) on delete set null;
create index tasks_source_idx on public.tasks (source_id);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  page int,
  token_count int,
  embedding extensions.vector(1024),
  fts tsvector generated always as (to_tsvector('italian', content)) stored,
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);
create index chunks_user_idx on public.chunks (user_id);
create index chunks_fts_idx on public.chunks using gin (fts);
create index chunks_embedding_idx on public.chunks using hnsw (embedding extensions.vector_cosine_ops);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Nuova conversazione',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_user_updated_idx on public.conversations (user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role public.message_role not null,
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  usage jsonb,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_user_idx on public.messages (user_id);

-- Azioni proposte dall'AI: niente cambia finché Enrico non approva.
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null, -- crea_task, crea_reminder, aggiorna_scheda, ...
  title text not null,
  payload jsonb not null,
  rationale text,
  status public.proposal_status not null default 'in_attesa',
  conversation_id uuid references public.conversations (id) on delete set null,
  source_id uuid references public.sources (id) on delete set null,
  result jsonb,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index proposals_user_status_idx on public.proposals (user_id, status, created_at desc);
create index proposals_conversation_idx on public.proposals (conversation_id);
create index proposals_source_idx on public.proposals (source_id);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_user_created_idx on public.activity_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- FASE 2: mail, calendario, brief
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null, -- google, microsoft, imap, telegram
  label text not null,
  email text,
  scopes text[] not null default '{}',
  -- token cifrati con Supabase Vault: qui solo il riferimento al segreto
  vault_secret_id uuid,
  sync_state jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounts_user_idx on public.accounts (user_id);

create table public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  provider_id text not null,
  thread_id text,
  from_address text,
  to_addresses text[] not null default '{}',
  subject text,
  snippet text,
  received_at timestamptz,
  importance smallint,
  category text,
  summary text,
  draft_reply text,
  needs_action boolean not null default false,
  is_read boolean not null default false,
  source_id uuid references public.sources (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, provider_id)
);
create index emails_user_received_idx on public.emails (user_id, received_at desc);
create index emails_source_idx on public.emails (source_id);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  provider_id text,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  attendees jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, provider_id)
);
create index calendar_events_user_start_idx on public.calendar_events (user_id, starts_at);

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brief_date date not null,
  content text not null,
  sent_via public.reminder_channel[],
  created_at timestamptz not null default now(),
  unique (user_id, brief_date)
);

-- ---------------------------------------------------------------------------
-- FASE 3: schede vive, collegamenti, fatti con scadenza, memoria di contesto
-- ---------------------------------------------------------------------------
create table public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.entity_kind not null,
  name text not null,
  aliases text[] not null default '{}',
  body text not null default '', -- pagina mantenuta dall'AI (markdown con citazioni)
  embedding extensions.vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, name)
);
create index entities_name_trgm_idx on public.entities using gin (name extensions.gin_trgm_ops);

-- Collegamento generico tra due oggetti qualsiasi (grafo).
create table public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_type text not null,
  from_id uuid not null,
  to_type text not null,
  to_id uuid not null,
  relation text not null default 'collegato',
  created_at timestamptz not null default now(),
  unique (from_type, from_id, to_type, to_id, relation)
);
create index links_user_idx on public.links (user_id);
create index links_to_idx on public.links (to_type, to_id);

create table public.facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entity_id uuid references public.entities (id) on delete cascade,
  source_id uuid references public.sources (id) on delete set null,
  statement text not null,
  cited_text text,
  valid_from date,
  valid_until date, -- es. scadenza di un contratto
  confidence real,
  created_at timestamptz not null default now()
);
create index facts_user_until_idx on public.facts (user_id, valid_until);
create index facts_entity_idx on public.facts (entity_id);
create index facts_source_idx on public.facts (source_id);

create table public.context_cache (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);

-- updated_at automatici --------------------------------------------------------
create trigger set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tasks for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.sources for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.conversations for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.accounts for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.entities for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: ogni riga appartiene al suo utente, e serve la 2FA completata (aal2).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'tasks', 'reminders', 'sources', 'chunks', 'conversations', 'messages',
    'proposals', 'push_subscriptions', 'activity_log', 'accounts', 'emails',
    'calendar_events', 'briefs', 'entities', 'links', 'facts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "proprietario" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "richiede 2FA" on public.%I as restrictive for all to authenticated
         using ((select auth.jwt() ->> ''aal'') = ''aal2'')
         with check ((select auth.jwt() ->> ''aal'') = ''aal2'')', t);
  end loop;
end;
$$;

alter table public.profiles enable row level security;
create policy "proprietario" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "richiede 2FA" on public.profiles as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

alter table public.context_cache enable row level security;
create policy "proprietario" on public.context_cache for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "richiede 2FA" on public.context_cache as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2') with check ((select auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- Ricerca ibrida: full-text italiano + vettori, unite con Reciprocal Rank Fusion.
-- security invoker: rispetta le regole RLS di chi la chiama.
-- ---------------------------------------------------------------------------
create or replace function public.hybrid_search(
  query_text text,
  query_embedding extensions.vector(1024),
  match_count int default 8,
  full_text_weight float default 1.0,
  semantic_weight float default 1.0,
  rrf_k int default 50
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_title text,
  content text,
  page int,
  chunk_index int,
  score float
)
language sql
stable
security invoker
set search_path = ''
as $$
  with full_text as (
    select c.id,
           row_number() over (
             order by ts_rank_cd(c.fts, websearch_to_tsquery('italian', query_text)) desc
           ) as rank_ix
    from public.chunks c
    where c.fts @@ websearch_to_tsquery('italian', query_text)
    limit least(match_count, 30) * 2
  ),
  semantic as (
    select c.id,
           row_number() over (order by c.embedding operator(extensions.<=>) query_embedding) as rank_ix
    from public.chunks c
    where c.embedding is not null and query_embedding is not null
    order by c.embedding operator(extensions.<=>) query_embedding
    limit least(match_count, 30) * 2
  )
  select c.id, c.source_id, s.title, c.content, c.page, c.chunk_index,
         coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight
         + coalesce(1.0 / (rrf_k + se.rank_ix), 0.0) * semantic_weight as score
  from full_text ft
  full outer join semantic se on ft.id = se.id
  join public.chunks c on c.id = coalesce(ft.id, se.id)
  join public.sources s on s.id = c.source_id
  order by score desc
  limit least(match_count, 30);
$$;

-- ---------------------------------------------------------------------------
-- Storage: bucket privato, ogni utente vede solo la propria cartella.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('sources', 'sources', false, 52428800)
on conflict (id) do nothing;

create policy "sources: proprietario legge" on storage.objects for select to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select auth.jwt() ->> 'aal') = 'aal2');
create policy "sources: proprietario carica" on storage.objects for insert to authenticated
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select auth.jwt() ->> 'aal') = 'aal2');
create policy "sources: proprietario elimina" on storage.objects for delete to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select auth.jwt() ->> 'aal') = 'aal2');
