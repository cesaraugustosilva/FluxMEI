-- FluxMEI - idempotencia forte para pagamentos de provedores.
-- Impede que o mesmo pagamento do provedor seja registrado em mais de uma assinatura.
-- Seguro para rodar mais de uma vez, mas resolva duplicados existentes antes do indice unico.

-- Diagnostico: execute esta consulta antes do indice.
-- Se retornar linhas, revise manualmente as assinaturas duplicadas antes de prosseguir.
select
  payment_provider,
  provider_payment_id,
  count(*) as total,
  array_agg(id order by created_at) as assinatura_ids
from public.assinaturas
where payment_provider is not null
  and provider_payment_id is not null
group by payment_provider, provider_payment_id
having count(*) > 1;

create unique index if not exists idx_assinaturas_provider_payment_unique
on public.assinaturas(payment_provider, provider_payment_id)
where payment_provider is not null
  and provider_payment_id is not null;
