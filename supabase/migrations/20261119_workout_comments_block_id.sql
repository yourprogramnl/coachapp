-- Feedback per onderdeel (19 nov 2026): een dagreactie kan bij één blok horen.
-- Leeg = reactie op de hele dag/sessie, zoals het altijd was. Bestaande apps
-- lezen deze kolom niet en blijven de reactie gewoon bij de dag tonen.
alter table public.workout_comments
  add column if not exists block_id uuid references public.blocks(id) on delete set null;
comment on column public.workout_comments.block_id is 'Blok waar deze reactie over gaat (feedback per onderdeel); null = reactie op de dag/sessie.';
create index if not exists workout_comments_block_id_idx on public.workout_comments(block_id) where block_id is not null;
