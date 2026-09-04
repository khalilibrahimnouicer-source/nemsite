-- m3dz_cs: base de données et règles de sécurité
create extension if not exists "pgcrypto";

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  price_per_day numeric(10,2) not null check (price_per_day >= 0),
  deposit numeric(10,2),
  year smallint,
  power text,
  transmission text,
  seats smallint,
  fuel text,
  color text,
  image_url text,
  status text not null default 'available' check (status in ('available','on_request','hidden')),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  customer_email text not null check (char_length(customer_email) <= 254),
  customer_phone text,
  start_date date,
  end_date date,
  message text check (char_length(message) <= 2000),
  status text not null default 'new' check (status in ('new','contacted','confirmed','declined','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_dates_valid check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.vehicle_unavailability (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint unavailability_dates_valid check (end_date >= start_date),
  constraint vehicle_unavailability_unique unique (vehicle_id, start_date, end_date)
);

create index booking_requests_vehicle_id_idx on public.booking_requests(vehicle_id);
create index vehicle_unavailability_vehicle_id_idx on public.vehicle_unavailability(vehicle_id);

create or replace function public.is_vehicle_owner(target_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vehicles where id = target_vehicle_id and owner_id = auth.uid());
$$;

alter table public.vehicles enable row level security;
alter table public.booking_requests enable row level security;
alter table public.vehicle_unavailability enable row level security;

-- Catalogue public, gestion réservée au propriétaire de chaque véhicule.
create policy "public_can_read_visible_vehicles" on public.vehicles for select using (status <> 'hidden' or owner_id = auth.uid());
create policy "owners_manage_vehicles" on public.vehicles for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Un visiteur peut créer une demande, sans pouvoir ensuite la lire. Seul le propriétaire y accède.
create policy "public_can_create_booking_requests" on public.booking_requests for insert with check (true);
create policy "owners_read_booking_requests" on public.booking_requests for select using (vehicle_id is not null and public.is_vehicle_owner(vehicle_id));
create policy "owners_update_booking_requests" on public.booking_requests for update using (vehicle_id is not null and public.is_vehicle_owner(vehicle_id));
create policy "owners_delete_booking_requests" on public.booking_requests for delete using (vehicle_id is not null and public.is_vehicle_owner(vehicle_id));

create policy "public_can_read_unavailability" on public.vehicle_unavailability for select using (true);
create policy "owners_manage_unavailability" on public.vehicle_unavailability for all using (public.is_vehicle_owner(vehicle_id)) with check (public.is_vehicle_owner(vehicle_id));
