-- Add a color-coded interest rating to leads. Existing leads default to neutral.
begin;

alter table public.leads
  add column if not exists interest_level text not null default 'neutral';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_interest_level_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_interest_level_check
      check (interest_level in ('very_interested', 'semi_interested', 'lightly_interested', 'neutral'));
  end if;
end
$$;

commit;
