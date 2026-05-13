create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'completo' check (plan in ('financeiro', 'completo')),
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'administrador' check (role in ('administrador', 'financeiro', 'estoque', 'vendas')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null check (type in ('clientes', 'funcionarios', 'usuarios', 'fornecedores')),
  name text not null,
  document text,
  phone text,
  email text,
  credit numeric not null default 0,
  manual_credit numeric not null default 0,
  earned_credit numeric not null default 0,
  notes text,
  username text,
  role text default 'vendas',
  active boolean not null default true,
  status text check (status in ('Lead', 'Cliente')),
  data_conversao timestamptz,
  preferred_size text,
  preferred_number text,
  import_source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.historico_tentativas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cliente_id uuid not null references public.people(id) on delete cascade,
  data timestamptz not null default now(),
  observacao text default '',
  resultado text not null default 'Contato realizado',
  created_at timestamptz not null default now()
);

alter table public.people add column if not exists status text check (status in ('Lead', 'Cliente'));
alter table public.people add column if not exists data_conversao timestamptz;
alter table public.people add column if not exists preferred_size text;
alter table public.people add column if not exists preferred_number text;

create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text default '',
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text default '',
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text,
  name text not null,
  category_id uuid references public.inventory_categories(id) on delete set null,
  category text,
  supplier_id uuid references public.people(id) on delete set null,
  quantity numeric not null default 0,
  cost numeric not null default 0,
  sale_price numeric not null default 0,
  minimum numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.finance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null check (type in ('receber', 'pagar')),
  description text not null,
  person_id uuid references public.people(id) on delete set null,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  amount numeric not null default 0,
  due_date date not null,
  status text not null default 'aberto',
  installment_number integer not null default 1,
  installment_total integer not null default 1,
  group_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.people(id) on delete set null,
  total numeric not null default 0,
  payment_status text not null,
  payment_method text,
  discount_value numeric not null default 0,
  credit_generated numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  quantity numeric not null,
  unit_price numeric not null,
  total numeric not null,
  cost_price numeric not null default 0
);

create table if not exists public.cash_closures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  closure_date date not null,
  opening_balance numeric not null default 0,
  total_sales numeric not null default 0,
  total_received numeric not null default 0,
  total_paid numeric not null default 0,
  closing_balance numeric not null default 0,
  notes text default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, closure_date)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  action text not null,
  entity_type text not null,
  entity_id text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_data_hora
on public.audit_logs(created_at);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.people enable row level security;
alter table public.historico_tentativas enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.cost_centers enable row level security;
alter table public.inventory enable row level security;
alter table public.finance enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.cash_closures enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.user_company_ids()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select company_id
  from public.company_members
  where user_id = auth.uid()
    and active = true
$$;

create or replace function public.create_company_for_current_user(company_name text, member_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  insert into public.companies (name, plan)
  values (coalesce(nullif(trim(company_name), ''), 'Sistema Exclusividade'), 'completo')
  returning id into new_company_id;

  insert into public.company_members (company_id, user_id, name, role, active)
  values (
    new_company_id,
    auth.uid(),
    coalesce(nullif(trim(member_name), ''), coalesce(auth.jwt() ->> 'email', 'Administrador')),
    'administrador',
    true
  );

  insert into public.people (company_id, type, name, email, username, role, active)
  values (
    new_company_id,
    'usuarios',
    coalesce(nullif(trim(member_name), ''), coalesce(auth.jwt() ->> 'email', 'Administrador')),
    auth.jwt() ->> 'email',
    auth.jwt() ->> 'email',
    'administrador',
    true
  );

  return new_company_id;
end;
$$;

drop policy if exists "members read own companies" on public.companies;
drop policy if exists "members manage own companies" on public.companies;
create policy "members manage own companies"
on public.companies for all
using (id in (select public.user_company_ids()));

drop policy if exists "members manage own company_members" on public.company_members;
create policy "members manage own company_members"
on public.company_members for all
using (company_id in (select public.user_company_ids()))
with check (company_id in (select public.user_company_ids()));

drop policy if exists "members manage own people" on public.people;
create policy "members manage own people"
on public.people for all
using (company_id in (select public.user_company_ids()))
with check (company_id in (select public.user_company_ids()));

drop policy if exists "members manage own historico_tentativas" on public.historico_tentativas;
create policy "members manage own historico_tentativas"
on public.historico_tentativas for all
using (company_id in (select public.user_company_ids()))
with check (company_id in (select public.user_company_ids()));

drop policy if exists "members manage own categories" on public.inventory_categories;
create policy "members manage own categories"
on public.inventory_categories for all
using (company_id in (select public.user_company_ids()))
with check (company_id in (select public.user_company_ids()));

drop policy if exists "members manage own cost centers" on public.cost_centers;
create policy "members manage own cost centers"
on public.cost_centers for all
using (company_id in (select public.user_company_ids()))
with check (company_id in (select public.user_company_ids()));

drop policy if exists "members manage own inventory" on public.inventory;
create policy "members manage own inventory"
on public.inventory for all
using (company_id in (select public.user_company_ids()))
with check (company_id in (select public.user_company_ids()));

drop policy if exists "members manage own finance" on public.finance;
create policy "members manage own finance"
on public.finance for all
using (company_id in (select public.user_company_ids()))
with check (company_id in (select public.user_company_ids()));

drop policy if exists "members manage own sales" on public.sales;
create policy "members manage own sales"
on public.sales for all
using (company_id in (select public.user_company_ids()))
with check (company_id in (select public.user_company_ids()));

drop policy if exists "members manage own sale items" on public.sale_items;
create policy "members manage own sale items"
on public.sale_items for all
using (company_id in (select public.user_company_ids()))
with check (company_id in (select public.user_company_ids()));

drop policy if exists "members manage own cash closures" on public.cash_closures;
create policy "members manage own cash closures"
on public.cash_closures for all
using (company_id in (select public.user_company_ids()))
with check (company_id in (select public.user_company_ids()));

drop policy if exists "members manage own audit logs" on public.audit_logs;
create policy "members manage own audit logs"
on public.audit_logs for all
using (company_id in (select public.user_company_ids()))
with check (company_id in (select public.user_company_ids()));
