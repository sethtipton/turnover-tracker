-- Milestones share the task order but are not counted as tasks.
alter table public.items drop constraint items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('task', 'material', 'dictation', 'milestone'));
alter table public.items add column milestone_date date;
