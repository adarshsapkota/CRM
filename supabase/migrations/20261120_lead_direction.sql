-- Classify whether the business contacted the lead or the lead contacted us.
-- Existing rows default to outbound; update any known inbound rows afterward.
begin;

alter table public.leads
  add column if not exists lead_direction text not null default 'outbound';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_lead_direction_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_lead_direction_check
      check (lead_direction in ('outbound', 'inbound'));
  end if;
end
$$;

commit;
