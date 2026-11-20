-- Restore missing default pipeline stages in existing projects. Existing stage
-- names, ordering, and user-created stages are left intact; missing stages are
-- appended in the expected order.
with defaults(name, is_followup, is_won, is_lost, ordinal) as (
  values
    ('Follow-up 3', true, false, false, 1),
    ('Demo/Meeting', false, false, false, 2),
    ('Proposal Sent', false, false, false, 3),
    ('Negotiation', false, false, false, 4),
    ('Won', false, true, false, 5),
    ('Lost', false, false, true, 6)
), missing as (
  select d.*
  from defaults d
  where not exists (
    select 1
    from public.pipeline_stages s
    where lower(s.name) = lower(d.name)
  )
), starting_order as (
  select coalesce(max(sort_order), 0) as value
  from public.pipeline_stages
)
insert into public.pipeline_stages (name, sort_order, is_followup, is_won, is_lost)
select m.name,
       starting_order.value + (row_number() over (order by m.ordinal) * 10)::integer,
       m.is_followup,
       m.is_won,
       m.is_lost
from missing m
cross join starting_order
order by m.ordinal;
