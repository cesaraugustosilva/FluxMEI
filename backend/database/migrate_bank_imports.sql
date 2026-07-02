create table if not exists public.bank_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  file_type text not null check (file_type in ('csv', 'ofx', 'xlsx')),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  total_rows integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.movimentacoes add column if not exists import_id uuid;
alter table public.movimentacoes add column if not exists external_id text;
alter table public.movimentacoes add column if not exists source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'movimentacoes_import_id_fkey'
  ) then
    alter table public.movimentacoes
      add constraint movimentacoes_import_id_fkey
      foreign key (import_id) references public.bank_imports(id) on delete set null;
  end if;
end $$;

create index if not exists idx_bank_imports_user_created on public.bank_imports(user_id, created_at desc);
create index if not exists idx_movimentacoes_import_id on public.movimentacoes(import_id);
create index if not exists idx_movimentacoes_user_external_id on public.movimentacoes(user_id, external_id) where external_id is not null;
create index if not exists idx_movimentacoes_user_import_dedupe
on public.movimentacoes(user_id, data, valor, lower(regexp_replace(descricao, '\s+', ' ', 'g')));

alter table public.bank_imports enable row level security;

drop policy if exists "bank_imports_select_own" on public.bank_imports;
create policy "bank_imports_select_own" on public.bank_imports
for select using (auth.uid() = user_id);

drop policy if exists "bank_imports_insert_own" on public.bank_imports;
create policy "bank_imports_insert_own" on public.bank_imports
for insert with check (auth.uid() = user_id);

drop policy if exists "bank_imports_update_own" on public.bank_imports;
create policy "bank_imports_update_own" on public.bank_imports
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
