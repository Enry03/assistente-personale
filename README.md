# Assistente personale

Web app privata di Enrico: homepage **Oggi**, task e promemoria, chat con Claude con citazioni dai documenti, archivio con ricerca ibrida. Fase 1 dell'MVP.

## Stack

- **Next.js 16** (App Router, `src/proxy.ts` per l'autenticazione) su **Vercel**
- **Supabase**: Postgres + RLS, Auth con 2FA TOTP obbligatoria, Storage privato, pgvector
- **Claude** (`@anthropic-ai/sdk`, modello in `CLAUDE_MODEL`, default `claude-opus-5-5`)
- **Voyage AI** per gli embedding (1024 dimensioni)
- Notifiche **Web Push** (PWA), inviate da `/api/cron/reminders` chiamato da `pg_cron`

## Struttura

| Percorso | Contenuto |
| --- | --- |
| `src/app/(app)/` | Pagine protette: Oggi, Chat, Task, Archivio, Impostazioni + server actions |
| `src/app/login/` | Login email/password, poi codice 2FA (o configurazione al primo accesso) |
| `src/app/api/` | Chat in streaming, elaborazione documenti, brief, push, cron |
| `src/lib/ai/` | Claude, embedding, ricerca ibrida, motore della chat con strumenti |
| `src/lib/ingest/` | Estrazione testo (PDF, Word, testo, immagini), chunking, analisi |
| `supabase/migrations/` | Schema completo (fasi 1-3), RLS, ricerca ibrida, bucket |

## Principi presi da claude-obsidian (MIT)

- Ogni fonte ha l'**originale immutabile** in Storage con hash SHA-256 (i duplicati vengono scartati).
- L'AI **non modifica i dati da sola**: crea `proposals` che Enrico approva o rifiuta con un tap, annullabili.
- Le risposte della chat **citano i passaggi** dei documenti usati.
- Schema già pronto per schede vive (`entities`), collegamenti (`links`), fatti con scadenza (`facts`) e memoria di contesto (`context_cache`).

## Configurazione

1. Copia `.env.example` in `.env.local` e compila le variabili.
2. Applica la migrazione su Supabase (`supabase db push` o SQL editor).
3. Inserisci l'email del proprietario (unico utente ammesso):
   ```sql
   insert into private.app_config (key, value) values ('owner_email', 'tua@email');
   ```
4. Crea l'utente da Supabase → Authentication → Add user, poi disattiva le registrazioni.
5. Al primo accesso l'app chiede di configurare la 2FA.
6. Genera le chiavi push con `npx web-push generate-vapid-keys`.
7. Programma il cron dei promemoria (dopo il deploy):
   ```sql
   select cron.schedule('promemoria', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://<dominio>/api/cron/reminders',
       headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))
     );
   $$);
   ```

## Sviluppo

```bash
npm install
npm run dev
```
