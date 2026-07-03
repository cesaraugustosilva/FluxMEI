alter table public.movimentacoes add column if not exists reconciliation_status text
  check (reconciliation_status in ('imported', 'reviewed', 'ignored', 'duplicated', 'reconciled'));

alter table public.movimentacoes add column if not exists category_confidence numeric(3,2)
  check (category_confidence is null or (category_confidence >= 0 and category_confidence <= 1));

alter table public.movimentacoes add column if not exists ai_category_suggestion text;
alter table public.movimentacoes add column if not exists duplicate_of uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'movimentacoes_duplicate_of_fkey'
  ) then
    alter table public.movimentacoes
      add constraint movimentacoes_duplicate_of_fkey
      foreign key (duplicate_of) references public.movimentacoes(id) on delete set null;
  end if;
end $$;

create index if not exists idx_movimentacoes_reconciliation
on public.movimentacoes(user_id, import_id, reconciliation_status);

create index if not exists idx_movimentacoes_duplicate_of
on public.movimentacoes(duplicate_of)
where duplicate_of is not null;
