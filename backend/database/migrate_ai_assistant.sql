-- FluxMEI - Assistente Financeiro Inteligente.
-- Historico de conversas da IA sem expor dados sensiveis no cliente.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_conversations_user_updated
on public.ai_conversations(user_id, updated_at desc);

create index if not exists idx_ai_messages_conversation_created
on public.ai_messages(conversation_id, created_at asc);

create index if not exists idx_ai_messages_user_created
on public.ai_messages(user_id, created_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "ai_conversations_no_client_access" on public.ai_conversations;
create policy "ai_conversations_no_client_access" on public.ai_conversations
  for all using (false) with check (false);

drop policy if exists "ai_messages_no_client_access" on public.ai_messages;
create policy "ai_messages_no_client_access" on public.ai_messages
  for all using (false) with check (false);
