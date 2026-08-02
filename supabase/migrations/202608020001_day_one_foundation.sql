create extension if not exists pgcrypto with schema extensions;

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'lifetime', 'monthly')),
  entitlement_status text not null default 'inactive'
    check (entitlement_status in ('active', 'inactive', 'past_due', 'refunded')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_window_valid check (
    (trial_started_at is null and trial_ends_at is null)
    or (trial_started_at is not null and trial_ends_at = trial_started_at + interval '14 days')
  )
);

create table public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  keywords text[] not null check (cardinality(keywords) between 1 and 5),
  voice_persona text check (voice_persona is null or char_length(voice_persona) <= 1000),
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_soft_delete_state check (deleted_at is null or is_active = false)
);

create index products_owner_active_idx on public.products (user_id, is_active) where deleted_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.activate_verified_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_at timestamptz;
begin
  if not new.is_active or new.deleted_at is not null then
    return new;
  end if;

  select email_confirmed_at into verified_at from auth.users where id = new.user_id;
  if verified_at is null then
    raise exception 'A verified email is required before activating a product'
      using errcode = '23514';
  end if;

  update public.user_profiles
  set entitlement_status = 'active', trial_started_at = now(), trial_ends_at = now() + interval '14 days'
  where id = new.user_id and trial_started_at is null and plan = 'free';
  return new;
end;
$$;

create trigger products_activate_verified_trial
after insert or update of is_active on public.products
for each row execute function public.activate_verified_trial();

alter table public.user_profiles enable row level security;
alter table public.products enable row level security;

create policy "profiles_select_own"
on public.user_profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "products_select_own"
on public.products for select to authenticated
using ((select auth.uid()) = user_id);

create policy "products_insert_own"
on public.products for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "products_update_own"
on public.products for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "products_delete_own"
on public.products for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.user_profiles from anon, authenticated;
revoke all on public.products from anon, authenticated;
grant select on public.user_profiles to authenticated;
grant select, insert, update, delete on public.products to authenticated;

comment on table public.user_profiles is 'Server-managed account, plan, and trial state.';
comment on table public.products is 'Private product context owned by one authenticated user.';
