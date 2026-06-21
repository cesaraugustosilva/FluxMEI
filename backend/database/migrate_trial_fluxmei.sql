-- FluxMEI - trial gratis de 7 dias e campos genericos de pagamento.
-- Seguro para rodar mais de uma vez no Supabase.

alter table public.assinaturas add column if not exists data_trial_fim date default (current_date + 7);
alter table public.assinaturas add column if not exists teste_gratis_usado boolean not null default false;
alter table public.assinaturas add column if not exists bloqueado boolean not null default false;
alter table public.assinaturas add column if not exists renovacao_automatica boolean not null default false;
alter table public.assinaturas add column if not exists checkout_url text;

alter table public.assinaturas add column if not exists payment_provider text;
alter table public.assinaturas add column if not exists provider_payment_id text;
alter table public.assinaturas add column if not exists provider_customer_id text;
alter table public.assinaturas add column if not exists provider_subscription_id text;
alter table public.assinaturas add column if not exists provider_status text;
alter table public.assinaturas add column if not exists provider_raw jsonb;

alter table public.assinaturas drop constraint if exists assinaturas_status_check;
alter table public.assinaturas add constraint assinaturas_status_check
check (status in ('ativo', 'pendente', 'vencido', 'cancelado', 'teste_gratis'));

alter table public.assinaturas drop constraint if exists assinaturas_plano_check;
alter table public.assinaturas add constraint assinaturas_plano_check
check (plano in ('gratuito', 'pro_mensal', 'pro_anual'));

update public.assinaturas
set
  status = 'teste_gratis',
  plano = 'gratuito',
  valor = 0,
  tipo_cobranca = 'mensal',
  data_inicio = coalesce(data_inicio, current_date),
  data_vencimento = coalesce(data_vencimento, current_date + 7),
  data_trial_fim = coalesce(data_trial_fim, data_vencimento, current_date + 7),
  teste_gratis_usado = true,
  bloqueado = false,
  renovacao_automatica = false
where status is null or status = 'ativo';

create index if not exists idx_assinaturas_provider_payment
on public.assinaturas(payment_provider, provider_payment_id);

create index if not exists idx_assinaturas_provider_subscription
on public.assinaturas(payment_provider, provider_subscription_id);
