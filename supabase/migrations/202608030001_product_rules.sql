create or replace function public.normalize_product_keyword(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select lower(regexp_replace(btrim(value), '[[:space:]]+', ' ', 'g'));
$$;

create or replace function public.product_keywords_are_normalized(values_to_check text[])
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  keyword text;
  seen text[] := '{}';
begin
  if cardinality(values_to_check) not between 1 and 25 then
    return false;
  end if;

  foreach keyword in array values_to_check loop
    if keyword <> public.normalize_product_keyword(keyword)
      or char_length(keyword) not between 2 and 80
      or keyword = any(seen) then
      return false;
    end if;
    seen := array_append(seen, keyword);
  end loop;

  return true;
end;
$$;

alter table public.products
  drop constraint if exists products_keywords_check,
  add constraint products_keywords_check
    check (public.product_keywords_are_normalized(keywords));

create or replace function public.enforce_product_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_plan text;
  active_product_limit integer;
  keyword_limit integer;
  active_product_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );

  select plan into owner_plan
  from public.user_profiles
  where id = new.user_id;

  if owner_plan is null then
    raise exception 'PRODUCT_OWNER_NOT_FOUND' using errcode = '23503';
  end if;

  active_product_limit := case owner_plan
    when 'monthly' then 3
    else 1
  end;

  keyword_limit := case owner_plan
    when 'free' then 5
    when 'lifetime' then 10
    when 'monthly' then 25
  end;

  if cardinality(new.keywords) > keyword_limit then
    raise exception 'KEYWORD_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  if new.is_active and new.deleted_at is null then
    select count(*) into active_product_count
    from public.products
    where user_id = new.user_id
      and is_active
      and deleted_at is null
      and id <> new.id;

    if active_product_count >= active_product_limit then
      raise exception 'PRODUCT_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger products_enforce_plan_limits
before insert or update of user_id, keywords, is_active, deleted_at
on public.products
for each row execute function public.enforce_product_plan_limits();

comment on function public.normalize_product_keyword(text)
is 'Canonical lowercase and collapsed-whitespace keyword form for PROD-003.';

comment on function public.enforce_product_plan_limits()
is 'Serializes and enforces the active-product and keyword limits from DEC-003/004.';
