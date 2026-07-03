alter table public.bank_imports add column if not exists bank_name text;
alter table public.bank_imports add column if not exists parser_used text;
alter table public.bank_imports add column if not exists confidence numeric(3,2)
  check (confidence is null or (confidence >= 0 and confidence <= 1));

create index if not exists idx_bank_imports_bank_name
on public.bank_imports(user_id, bank_name)
where bank_name is not null;
