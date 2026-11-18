-- Template week (was "Programma's") can hold many weeks: the coach's worksheet.
-- An assignment may now cover only part of it. week_from is the first template
-- week that lands on start_date; weeks stays the number of weeks assigned.
-- Applied to the live project on 18 Nov 2026 (migration program_assignments_week_from).
alter table public.program_assignments
  add column if not exists week_from integer not null default 1 check (week_from >= 1);
comment on column public.program_assignments.week_from is 'First week of the template that lands on start_date (1 = from the start).';
