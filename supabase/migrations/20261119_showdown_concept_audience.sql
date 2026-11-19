-- Showdown-bouwer (19 nov 2026): een Showdown die nog niet gepland is staat als
-- workout met audience 'blog_concept'. Geen enkele bestaande leesregel, lijst of mail
-- kijkt naar die waarde, dus leden zien een concept nergens (ook niet in de telefoon-app).
-- Live zetten = audience op 'blog' zetten met de gekozen datum.
alter table public.workouts drop constraint workouts_audience_check;
alter table public.workouts add constraint workouts_audience_check
  check (audience = any (array['client'::text, 'company'::text, 'blog'::text, 'blog_concept'::text]));
comment on column public.workouts.audience is
  'client = 1-op-1, company = groep, blog = openbare weekworkout of blogprogramma, blog_concept = Showdown in de bouwer die nog niet live staat (alleen maker en beheerders zien hem)';
