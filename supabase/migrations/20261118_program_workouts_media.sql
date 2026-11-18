-- Templates (Template week / Template dag) keep the demo videos of the warm-up
-- and cooldown, same shape as workouts.warmup_media / cooldown_media.
-- Applied to the live project on 18 Nov 2026 (migration program_workouts_warmup_cooldown_media).
alter table public.program_workouts
  add column if not exists warmup_media jsonb,
  add column if not exists cooldown_media jsonb;
