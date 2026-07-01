-- FluxMEI - incremento atomico de uso de cupons.
-- Evita corrida entre pagamentos concorrentes no ultimo uso disponivel.

create or replace function public.increment_coupon_usage_atomic(p_coupon_id uuid)
returns public.coupons
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_coupon public.coupons;
  existing_coupon public.coupons;
begin
  if p_coupon_id is null then
    raise exception 'Cupom nao encontrado.';
  end if;

  update public.coupons
  set current_uses = current_uses + 1
  where id = p_coupon_id
    and active is true
    and (valid_from is null or valid_from <= now())
    and (valid_until is null or valid_until >= now())
    and (max_uses is null or current_uses < max_uses)
  returning * into updated_coupon;

  if found then
    return updated_coupon;
  end if;

  select * into existing_coupon
  from public.coupons
  where id = p_coupon_id;

  if not found then
    raise exception 'Cupom nao encontrado.';
  end if;

  if existing_coupon.active is not true then
    raise exception 'Cupom inativo.';
  end if;

  if existing_coupon.valid_from is not null and existing_coupon.valid_from > now() then
    raise exception 'Cupom ainda nao esta vigente.';
  end if;

  if existing_coupon.valid_until is not null and existing_coupon.valid_until < now() then
    raise exception 'Cupom expirado.';
  end if;

  if existing_coupon.max_uses is not null and existing_coupon.current_uses >= existing_coupon.max_uses then
    raise exception 'Cupom atingiu o limite de usos.';
  end if;

  raise exception 'Cupom nao pode ser utilizado.';
end;
$$;

revoke all on function public.increment_coupon_usage_atomic(uuid) from public;
grant execute on function public.increment_coupon_usage_atomic(uuid) to service_role;
