create extension if not exists pgcrypto;
create table if not exists public.ynr_settings(key text primary key,value jsonb not null);
create table if not exists public.ynr_vehicles(id text primary key,name text not null,type text not null,price_per_day numeric(10,2) not null default 0,deposit numeric(10,2) not null default 0,description text,image_url text,status text not null default 'available',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.ynr_requests(id uuid primary key default gen_random_uuid(),vehicle_id text,vehicle_name text,customer_name text not null,customer_email text not null,customer_phone text,start_date date,end_date date,message text,status text not null default 'new',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.ynr_blocked(id uuid primary key default gen_random_uuid(),vehicle_id text not null,start_date date not null,end_date date not null,created_at timestamptz not null default now());
revoke all on public.ynr_settings,public.ynr_vehicles,public.ynr_requests,public.ynr_blocked from anon,authenticated;
insert into public.ynr_settings(key,value) values
('brand','"YNR Luxury"'),('tagline','"Location de véhicules premium."'),('phone','"07 46 38 99 31"'),('email','"ynr.location@gmail.com"'),('whatsapp','"https://wa.me/33746389931"'),('instagram','"https://instagram.com/ynr_location"') on conflict(key) do nothing;
