-- Groepschat gekoppeld aan een blogprogramma (18 nov 2026, verzoek Stefan): gratis Showdown-leden
-- zien in de chat alleen een groep waarin alleen coaches berichten sturen ("voorkomt gezeur").
-- Wie het gekoppelde programma volgt, zit automatisch in de groep; wie stopt, gaat eruit.
-- Algemeen opgezet: elke groep kan aan één programma hangen (chat_groups.blog_program_id).

alter table public.chat_groups
  add column if not exists blog_program_id uuid references public.blog_programs(id) on delete set null;
comment on column public.chat_groups.blog_program_id is
  'Gekoppeld programma: wie het volgt (blog_program_members) zit automatisch in deze groep, wie stopt gaat eruit.';
create index if not exists chat_groups_blog_program_idx
  on public.chat_groups (blog_program_id) where blog_program_id is not null;

-- Lid komt bij of stopt met een programma: groepen van dat programma bijwerken.
create or replace function private.groep_volgt_programma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.chat_group_members (group_id, profile_id, company_id)
    select g.id, new.athlete_id, g.company_id
      from public.chat_groups g
     where g.blog_program_id = new.blog_program_id
    on conflict (group_id, profile_id) do nothing;
  elsif tg_op = 'DELETE' then
    delete from public.chat_group_members m
     using public.chat_groups g
     where g.id = m.group_id
       and g.blog_program_id = old.blog_program_id
       and m.profile_id = old.athlete_id;
  end if;
  return null;
end
$$;

drop trigger if exists blog_program_members_groepen on public.blog_program_members;
create trigger blog_program_members_groepen
  after insert or delete on public.blog_program_members
  for each row execute function private.groep_volgt_programma();

-- Groep aan een programma gekoppeld (nieuw of gewijzigd): alle huidige volgers erin.
create or replace function private.groep_programma_gekoppeld()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.blog_program_id is not null
     and (tg_op = 'INSERT' or new.blog_program_id is distinct from old.blog_program_id) then
    insert into public.chat_group_members (group_id, profile_id, company_id)
    select new.id, m.athlete_id, new.company_id
      from public.blog_program_members m
     where m.blog_program_id = new.blog_program_id
    on conflict (group_id, profile_id) do nothing;
  end if;
  return null;
end
$$;

drop trigger if exists chat_groups_programma on public.chat_groups;
create trigger chat_groups_programma
  after insert or update of blog_program_id on public.chat_groups
  for each row execute function private.groep_programma_gekoppeld();

revoke all on function private.groep_volgt_programma() from public;
revoke all on function private.groep_programma_gekoppeld() from public;

-- De groep zelf: "YP Showdown", alleen coaches sturen, gekoppeld aan het programma YP Showdown.
insert into public.chat_groups (company_id, name, announce_only, created_by, blog_program_id)
select p.company_id, 'YP Showdown', true, 'f9bae679-a2cb-478d-878f-36236eeae8ae', p.id
  from public.blog_programs p
 where p.id = '9da71cf7-f0d7-4322-9b4f-74ac7b1ed879'
   and not exists (select 1 from public.chat_groups g where g.blog_program_id = p.id);
