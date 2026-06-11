-- FluxMEI - corrige RLS de assinaturas.
-- Execute no SQL Editor do Supabase em bancos existentes.
--
-- Objetivo:
-- - usuarios autenticados podem consultar apenas a propria assinatura;
-- - usuarios autenticados nao podem inserir, atualizar ou apagar assinaturas diretamente;
-- - alteracoes de assinatura continuam exclusivas do backend com SUPABASE_SERVICE_ROLE_KEY.

alter table public.assinaturas enable row level security;

drop policy if exists "assinaturas_update_own" on public.assinaturas;
drop policy if exists "assinaturas_insert_own" on public.assinaturas;
drop policy if exists "assinaturas_delete_own" on public.assinaturas;

drop policy if exists "assinaturas_select_own" on public.assinaturas;
create policy "assinaturas_select_own" on public.assinaturas
for select
to authenticated
using (auth.uid() = user_id);
