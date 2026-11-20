begin;

-- Shared catalog management. These tables are visible to authenticated users;
-- their rows are shared across users in this single-workspace CRM.
drop policy if exists "Authenticated users can add categories" on public.categories;
drop policy if exists "Authenticated users can update categories" on public.categories;
drop policy if exists "Authenticated users can delete categories" on public.categories;
create policy "Authenticated users can add categories"
  on public.categories for insert to authenticated with check (true);
create policy "Authenticated users can update categories"
  on public.categories for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete categories"
  on public.categories for delete to authenticated using (true);

drop policy if exists "Authenticated users can add products" on public.products;
drop policy if exists "Authenticated users can update products" on public.products;
create policy "Authenticated users can add products"
  on public.products for insert to authenticated with check (true);
create policy "Authenticated users can update products"
  on public.products for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can add product prices" on public.product_prices;
drop policy if exists "Authenticated users can update product prices" on public.product_prices;
drop policy if exists "Authenticated users can delete product prices" on public.product_prices;
create policy "Authenticated users can add product prices"
  on public.product_prices for insert to authenticated with check (true);
create policy "Authenticated users can update product prices"
  on public.product_prices for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete product prices"
  on public.product_prices for delete to authenticated using (true);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  total numeric(12,2) not null check (total >= 0),
  currency text not null default 'NPR' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists quotes_owner_created_idx on public.quotes(owner_id, created_at desc);
create index if not exists quotes_lead_idx on public.quotes(lead_id);

alter table public.quotes enable row level security;
drop policy if exists "Owners can read their quotes" on public.quotes;
drop policy if exists "Owners can create quotes for their leads" on public.quotes;
drop policy if exists "Owners can update their quotes" on public.quotes;
drop policy if exists "Owners can delete their quotes" on public.quotes;

create policy "Owners can read their quotes"
  on public.quotes for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners can create quotes for their leads"
  on public.quotes for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.leads l where l.id = quotes.lead_id and l.owner_id = (select auth.uid()))
  );
create policy "Owners can update their quotes"
  on public.quotes for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.leads l where l.id = quotes.lead_id and l.owner_id = (select auth.uid()))
  );
create policy "Owners can delete their quotes"
  on public.quotes for delete to authenticated
  using (owner_id = (select auth.uid()));

commit;
