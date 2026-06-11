-- FluxMEI - campos genericos para processadores de pagamento.
-- Seguro para rodar mais de uma vez no Supabase.

alter table public.assinaturas add column if not exists payment_provider text;
alter table public.assinaturas add column if not exists provider_payment_id text;
alter table public.assinaturas add column if not exists provider_customer_id text;
alter table public.assinaturas add column if not exists provider_subscription_id text;
alter table public.assinaturas add column if not exists provider_status text;
alter table public.assinaturas add column if not exists provider_raw jsonb;

create index if not exists idx_assinaturas_provider_payment
on public.assinaturas(payment_provider, provider_payment_id);

create index if not exists idx_assinaturas_provider_subscription
on public.assinaturas(payment_provider, provider_subscription_id);

update public.assinaturas
set
  payment_provider = coalesce(payment_provider, 'mercado_pago'),
  provider_payment_id = coalesce(provider_payment_id, mercado_pago_payment_id),
  provider_status = coalesce(provider_status, mercado_pago_status)
where
  (mercado_pago_payment_id is not null or mercado_pago_status is not null)
  and payment_provider is null;
