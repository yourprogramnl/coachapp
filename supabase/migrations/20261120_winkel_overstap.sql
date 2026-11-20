-- Winkel: persoonlijke overstaplink (20 november 2026).
-- Voor leden die al ergens anders betalen (Strivee): ze rekenen nu af in onze winkel, maar de
-- eerste afschrijving volgt pas op de dag dat hun oude abonnement anders zou verlengen. Zo betaalt
-- niemand dubbel. Eén rij per lid; de geheime sleutel (token) zit in de link uit de mail.
-- shop-checkout leest deze tabel met de service-sleutel; de etalage en leden komen er niet bij.

create table if not exists public.shop_overstap (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  blog_program_id uuid not null references public.blog_programs(id) on delete cascade,
  email text,
  naam text,
  -- De dag waarop het oude abonnement verlengt. Ligt die dag (bijna) achter ons, dan rekent
  -- shop-checkout met dezelfde dag van de volgende maand.
  eerste_afschrijving date not null,
  geldig_tot timestamptz not null default (now() + interval '45 days'),
  bron text not null default 'strivee',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists shop_overstap_company_idx on public.shop_overstap(company_id);
create index if not exists shop_overstap_program_idx on public.shop_overstap(blog_program_id);
create index if not exists shop_overstap_created_by_idx on public.shop_overstap(created_by);

alter table public.shop_overstap enable row level security;
revoke all on public.shop_overstap from anon;

-- Alleen de eigenaar van het bedrijf en de beheerders: de sleutel in een rij is een betaallink
-- op naam. Coaches en leden zien deze tabel niet.
drop policy if exists "shop_overstap beheer" on public.shop_overstap;
create policy "shop_overstap beheer" on public.shop_overstap
  for all
  using (
    (select private.my_role()) = 'platform_admin'::user_role
    or ((select private.my_role()) = 'eigenaar'::user_role and company_id = (select private.my_company()))
  )
  with check (
    (select private.my_role()) = 'platform_admin'::user_role
    or ((select private.my_role()) = 'eigenaar'::user_role and company_id = (select private.my_company()))
  );

-- Op de bestelling: via welke overstaplink, en wanneer de eerste afschrijving is (leeg = betaald
-- bij het bestellen, zoals altijd). De bevestigingsmail en de bedankpagina lezen dit.
alter table public.shop_orders
  add column if not exists overstap_id uuid references public.shop_overstap(id) on delete set null,
  add column if not exists eerste_betaling timestamptz;
create index if not exists shop_orders_overstap_idx on public.shop_orders(overstap_id);
