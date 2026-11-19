-- Snelle antwoorden in Berichten (19 nov 2026): standaardzinnen die een coach
-- vaak stuurt. Typ "/" in het typvak en kies er een. Ieder beheert zijn eigen
-- lijstje; niemand anders kan het lezen of wijzigen. {voornaam} in de tekst
-- wordt bij het invoegen de voornaam van de klant.
create table if not exists public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  body text not null check (length(btrim(body)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.quick_replies is 'Snelle antwoorden (standaardzinnen) van een coach voor de chat; alleen de eigenaar van de rij leest en schrijft.';
create index if not exists quick_replies_owner_idx on public.quick_replies(owner_id, sort_order, created_at);
create index if not exists quick_replies_company_idx on public.quick_replies(company_id);

alter table public.quick_replies enable row level security;

create policy quick_replies_select on public.quick_replies for select to authenticated
  using (owner_id = (select auth.uid()));
create policy quick_replies_insert on public.quick_replies for insert to authenticated
  with check (owner_id = (select auth.uid())
    and company_id = (select private.my_company())
    and (select private.my_role()) in ('coach'::user_role, 'eigenaar'::user_role, 'platform_admin'::user_role));
create policy quick_replies_update on public.quick_replies for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and company_id = (select private.my_company()));
create policy quick_replies_delete on public.quick_replies for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Alleen ingelogde gebruikers; anoniem heeft hier niets te zoeken.
revoke all on public.quick_replies from anon;
