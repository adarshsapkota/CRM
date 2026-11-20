-- Pipeline stages are shared lookup data. Grant authenticated app users permission
-- to add/edit stages; RLS still blocks anonymous access.
drop policy if exists "Authenticated users can add pipeline stages" on public.pipeline_stages;
drop policy if exists "Authenticated users can update pipeline stages" on public.pipeline_stages;

create policy "Authenticated users can add pipeline stages"
  on public.pipeline_stages for insert to authenticated
  with check (true);

create policy "Authenticated users can update pipeline stages"
  on public.pipeline_stages for update to authenticated
  using (true)
  with check (true);

-- Log all stage changes at the database layer so every client records them.
create or replace function public.log_lead_stage_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_stage_name text;
  new_stage_name text;
begin
  if new.stage_id is distinct from old.stage_id then
    select name into old_stage_name from public.pipeline_stages where id = old.stage_id;
    select name into new_stage_name from public.pipeline_stages where id = new.stage_id;
    insert into public.activities (lead_id, type, outcome, created_by)
    values (
      new.id,
      'stage_change',
      coalesce(old_stage_name, 'Unknown') || ' → ' || coalesce(new_stage_name, 'Unknown'),
      coalesce(auth.uid(), new.owner_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists leads_log_stage_change on public.leads;
create trigger leads_log_stage_change
  after update of stage_id on public.leads
  for each row execute function public.log_lead_stage_change();

-- Backfill existing lead-level follow-up dates so they appear in the new tabs.
insert into public.follow_ups (lead_id, follow_up_number, scheduled_date)
select l.id,
       coalesce(nullif(substring(s.name from '[0-9]+'), '')::integer, 1),
       l.next_follow_up_date
from public.leads l
left join public.pipeline_stages s on s.id = l.stage_id
where l.next_follow_up_date is not null
  and not exists (
    select 1 from public.follow_ups f
    where f.lead_id = l.id and f.completed_at is null
  );
