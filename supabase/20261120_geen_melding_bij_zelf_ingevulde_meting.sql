-- 20 nov 2026, besluit Stefan: een meting die een atleet zelf invult bij Metingen & PR's
-- geeft de coach geen melding meer. Zo'n meting kan van een jaar terug zijn; de coach hoeft
-- er niets mee. Een PR uit een gelogde workout (per set) meldt nog wel, via
-- private.results_pr_notificatie op results.
-- De functie private.notif_bij_metric blijft staan, zodat terugzetten één regel is:
--   create trigger notif_metric after insert on public.metrics
--     for each row execute function private.notif_bij_metric();
drop trigger if exists notif_metric on public.metrics;
comment on function private.notif_bij_metric() is 'Niet meer in gebruik sinds 20 nov 2026 (besluit Stefan): een zelf ingevulde meting geeft de coach geen melding. Trigger notif_metric op metrics is verwijderd.';
