-- Template week en Template dag houden het gedeelde leaderboard vast (19 nov 2026).
-- Een blok in een template kan nu, net als een blok bij een klant, verwijzen naar een YP Showdown
-- of een leaderboard-workout. Zet de coach de template bij een klant, dan gaat de verwijzing mee
-- en komt de klant op hetzelfde leaderboard. Verdwijnt de bron-workout, dan wordt het een gewoon blok.
alter table public.program_blocks add column source_blog_workout_id uuid references public.workouts(id) on delete set null;
comment on column public.program_blocks.source_blog_workout_id is
  'verwijzing naar een YP Showdown (workouts.audience blog) of leaderboard-workout (bord); gaat mee naar blocks.source_blog_workout_id als de template bij een klant wordt gezet';
create index program_blocks_source_blog_idx on public.program_blocks (source_blog_workout_id) where source_blog_workout_id is not null;
