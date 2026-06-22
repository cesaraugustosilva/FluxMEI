-- FluxMEI - campos genericos para processadores de pagamento.
-- Seguro para rodar mais de uma vez no Supabase.

alter table public.assinaturas add column if not exists payment_provider text;
alter table public.assinaturas add column if not exists provider_payment_id text;
alter table public.assinaturas add column if not exists provider_customer_id text;
alter table public.assinaturas add column if not exists provider_subscription_id text;
alter table public.assinaturas add column if not exists provider_status text;
alter table public.assinaturas add column if not exists provider_raw jsonb;
alter table public.assinaturas add column if not exists paid_at timestamptz;

create index if not exists idx_assinaturas_provider_payment
on public.assinaturas(payment_provider, provider_payment_id);

create index if not exists idx_assinaturas_provider_subscription
on public.assinaturas(payment_provider, provider_subscription_id);
