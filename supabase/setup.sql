-- Initial CRM schema for a clean Supabase project.
-- Run this once in Supabase SQL Editor, then run the two later migrations.

begin;

create extension if not exists pgcrypto with schema extensions;

create type public.billing_type as enum ('one-time', 'monthly', 'yearly');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null unique,
  is_followup boolean not null default false,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  constraint pipeline_stages_terminal_check check (not (is_won and is_lost))
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  billing_type public.billing_type not null,
  currency text not null default 'NPR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_prices_product_category_billing_currency_key
    unique nulls not distinct (product_id, category_id, billing_type, currency)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  category_id uuid references public.categories(id) on delete set null,
  existing_website text,
  social_media jsonb not null default '{}'::jsonb,
  stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
  next_follow_up_date date,
  source text,
  lead_direction text not null default 'outbound' check (lead_direction in ('outbound', 'inbound')),
  notes text,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_social_media_object check (jsonb_typeof(social_media) = 'object'),
  constraint leads_social_media_keys check (
    social_media - array['facebook', 'instagram', 'linkedin', 'tiktok', 'other'] = '{}'::jsonb
  )
);

create table public.lead_products (
  lead_id uuid not null references public.leads(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (lead_id, product_id)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null check (
    type in ('call', 'whatsapp', 'email', 'meeting', 'note', 'stage_change', 'follow_up')
  ),
  outcome text,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  follow_up_number integer not null check (follow_up_number > 0),
  scheduled_date date not null,
  completed_at timestamptz,
  outcome text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_owner_created_idx on public.leads(owner_id, created_at desc);
create index leads_owner_follow_up_idx on public.leads(owner_id, next_follow_up_date);
create index leads_category_idx on public.leads(category_id);
create index leads_stage_idx on public.leads(stage_id);
create index product_prices_category_idx on public.product_prices(category_id);
create index lead_products_product_idx on public.lead_products(product_id);
create index activities_lead_created_idx on public.activities(lead_id, created_at desc);
create index activities_created_by_idx on public.activities(created_by);
create index follow_ups_lead_scheduled_idx on public.follow_ups(lead_id, scheduled_date);
create index follow_ups_open_scheduled_idx on public.follow_ups(scheduled_date) where completed_at is null;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();
create trigger product_prices_set_updated_at
  before update on public.product_prices
  for each row execute function public.set_updated_at();
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();
create trigger follow_ups_set_updated_at
  before update on public.follow_ups
  for each row execute function public.set_updated_at();

insert into public.pipeline_stages (name, sort_order, is_followup, is_won, is_lost) values
  ('New', 10, false, false, false),
  ('Contacted', 20, false, false, false),
  ('Follow-up 1', 30, true, false, false),
  ('Follow-up 2', 40, true, false, false),
  ('Follow-up 3', 50, true, false, false),
  ('Demo/Meeting', 60, false, false, false),
  ('Proposal Sent', 70, false, false, false),
  ('Negotiation', 80, false, false, false),
  ('Won', 90, false, true, false),
  ('Lost', 100, false, false, true);

insert into public.categories (name) values ('Retail'), ('Restaurant'), ('School');

alter table public.categories enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.leads enable row level security;
alter table public.lead_products enable row level security;
alter table public.activities enable row level security;
alter table public.follow_ups enable row level security;

create policy "Authenticated users can read categories"
  on public.categories for select to authenticated using (true);
create policy "Authenticated users can read pipeline stages"
  on public.pipeline_stages for select to authenticated using (true);
create policy "Authenticated users can read products"
  on public.products for select to authenticated using (true);
create policy "Authenticated users can read product prices"
  on public.product_prices for select to authenticated using (true);

create policy "Owners can read their leads"
  on public.leads for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users can create their own leads"
  on public.leads for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners can update their leads"
  on public.leads for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners can delete their leads"
  on public.leads for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Owners can read lead product links"
  on public.lead_products for select to authenticated using (
    exists (select 1 from public.leads l where l.id = lead_products.lead_id and l.owner_id = (select auth.uid()))
  );
create policy "Owners can add lead product links"
  on public.lead_products for insert to authenticated with check (
    exists (select 1 from public.leads l where l.id = lead_products.lead_id and l.owner_id = (select auth.uid()))
  );
create policy "Owners can remove lead product links"
  on public.lead_products for delete to authenticated using (
    exists (select 1 from public.leads l where l.id = lead_products.lead_id and l.owner_id = (select auth.uid()))
  );

create policy "Owners can read lead activities"
  on public.activities for select to authenticated using (
    exists (select 1 from public.leads l where l.id = activities.lead_id and l.owner_id = (select auth.uid()))
  );
create policy "Owners can add lead activities"
  on public.activities for insert to authenticated with check (
    created_by = (select auth.uid()) and
    exists (select 1 from public.leads l where l.id = activities.lead_id and l.owner_id = (select auth.uid()))
  );
create policy "Owners can update lead activities"
  on public.activities for update to authenticated
  using (exists (select 1 from public.leads l where l.id = activities.lead_id and l.owner_id = (select auth.uid())))
  with check (
    created_by = (select auth.uid()) and
    exists (select 1 from public.leads l where l.id = activities.lead_id and l.owner_id = (select auth.uid()))
  );
create policy "Owners can delete lead activities"
  on public.activities for delete to authenticated using (
    exists (select 1 from public.leads l where l.id = activities.lead_id and l.owner_id = (select auth.uid()))
  );

create policy "Owners can read lead follow-ups"
  on public.follow_ups for select to authenticated using (
    exists (select 1 from public.leads l where l.id = follow_ups.lead_id and l.owner_id = (select auth.uid()))
  );
create policy "Owners can add lead follow-ups"
  on public.follow_ups for insert to authenticated with check (
    exists (select 1 from public.leads l where l.id = follow_ups.lead_id and l.owner_id = (select auth.uid()))
  );
create policy "Owners can update lead follow-ups"
  on public.follow_ups for update to authenticated
  using (exists (select 1 from public.leads l where l.id = follow_ups.lead_id and l.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.leads l where l.id = follow_ups.lead_id and l.owner_id = (select auth.uid())));
create policy "Owners can delete lead follow-ups"
  on public.follow_ups for delete to authenticated using (
    exists (select 1 from public.leads l where l.id = follow_ups.lead_id and l.owner_id = (select auth.uid()))
  );

commit;
