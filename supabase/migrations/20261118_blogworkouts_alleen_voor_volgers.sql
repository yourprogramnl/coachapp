-- Betaalde blogprogramma's alleen voor wie ze volgt (18 nov 2026, Stefan: "Ja, dichtzetten").
--
-- Tot nu toe mocht elk lid van het bedrijf alle blogworkouts lezen (policy workouts_blog_read).
-- De app toonde alleen de programma's die iemand volgt, maar de database gaf alles. Sinds
-- iedereen zich gratis kan aanmelden voor de Showdown, kon een gratis account zo met wat
-- technische kennis alle betaalde programmering opvragen.
--
-- Nieuwe regel voor het lezen van een blogworkout door een lid:
--   * hij hoort bij geen programma (de oude openbare weekworkouts), of
--   * het programma is open: niet in het abonnement en zonder prijs (zoals de gratis Showdown), of
--   * het lid volgt het programma (blog_program_members, ook via het abonnement), of
--   * het lid heeft er zelf een resultaat op gelogd (eigen geschiedenis blijft leesbaar).
-- Coaches, eigenaren en beheerders lezen zoals voorheen alle blogworkouts van hun bedrijf.
-- De blokken volgen vanzelf: blocks_member_audience_read leest via workouts, waar deze regel geldt.
-- Verborgen programma's en concepten blijven daarnaast dicht (restrictieve policies
-- workouts_hidden_blog en workouts_draft_hidden, ongewijzigd).

-- Open programma's van mijn bedrijf plus de programma's die ik volg.
create or replace function private.mijn_blog_programmas()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.id), '{}'::uuid[])
    from public.blog_programs p
   where p.company_id = private.my_company()
     and not p.hidden
     and ((not p.in_abonnement and coalesce(p.price_cents, 0) = 0)
          or exists (select 1 from public.blog_program_members m
                      where m.blog_program_id = p.id and m.athlete_id = auth.uid()))
$$;

-- Blogworkouts van een programma waarop ik zelf een resultaat heb gelogd.
create or replace function private.mijn_gelogde_blogworkouts()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r.workout_id), '{}'::uuid[])
    from public.results r
    join public.workouts w on w.id = r.workout_id
   where r.athlete_id = auth.uid()
     and w.audience = 'blog'
     and w.blog_program_id is not null
$$;

revoke all on function private.mijn_blog_programmas() from public, anon;
revoke all on function private.mijn_gelogde_blogworkouts() from public, anon;
grant execute on function private.mijn_blog_programmas() to authenticated;
grant execute on function private.mijn_gelogde_blogworkouts() to authenticated;

drop policy if exists workouts_blog_read on public.workouts;
create policy workouts_blog_read on public.workouts
  for select
  using (
    audience = 'blog'
    and company_id = (select private.my_company())
    and (
      blog_program_id is null
      or (select private.my_role()) = any (array['coach', 'eigenaar', 'platform_admin']::public.user_role[])
      or blog_program_id = any ((select private.mijn_blog_programmas())::uuid[])
      or id = any ((select private.mijn_gelogde_blogworkouts())::uuid[])
    )
  );
comment on policy workouts_blog_read on public.workouts is
  'Blogworkouts: zonder programma of van een open programma voor elk lid van het bedrijf; anders alleen voor wie het programma volgt of er zelf op logde. Coaches, eigenaren en beheerders alles van hun bedrijf.';
