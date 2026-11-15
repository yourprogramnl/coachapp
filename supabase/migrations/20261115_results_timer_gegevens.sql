-- Gegevens uit de timer van de app bij een score (15 nov 2026, wens Stefan: pauzes en
-- een samenvatting in het coach-dashboard). De rondetijden staan al in splits; hier komt
-- bij welke timer het was en hoe vaak en hoe lang er is gepauzeerd.
-- Vorm: { "type": "amrap", "sec": 1200, "pauzes": 2, "pauze_sec": 45, "over": 13, "vroeg": true }
alter table public.results add column if not exists timer jsonb;

alter table public.results
  add constraint results_timer_is_object
  check (timer is null or jsonb_typeof(timer) = 'object');

comment on column public.results.timer is
  'Timer van de app bij deze score: type (fortime, amrap, emom, tabata, interval), sec (verstreken werktijd), pauzes (aantal), pauze_sec (totaal), over (seconden na de laatste ronde), vroeg (eerder gestopt). Rondetijden staan in splits.';
