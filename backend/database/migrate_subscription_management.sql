-- FluxMEI - gerenciamento seguro de cancelamento e reativacao de assinatura.
-- Mantem pagamentos e historico intactos; apenas agenda encerramento de ciclo.

alter table public.assinaturas
  add column if not exists cancel_at_period_end boolean not null default false;

alter table public.assinaturas
  add column if not exists cancelled_at timestamptz;

alter table public.assinaturas
  add column if not exists reactivated_at timestamptz;

create index if not exists idx_assinaturas_user_cancel_at_period_end
on public.assinaturas(user_id, cancel_at_period_end);
