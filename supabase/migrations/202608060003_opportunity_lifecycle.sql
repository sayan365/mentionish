create or replace function public.skip_opportunity(
  p_opportunity_id uuid,
  p_reason text default 'Skipped by user.'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'INVALID_SKIP_REASON' using errcode = '22023';
  end if;

  update public.opportunities
  set status = 'skipped',
      skipped_reason = btrim(p_reason),
      posted_at = null
  where id = p_opportunity_id
    and user_id = auth.uid()
    and status in ('new', 'drafted');
  return found;
end;
$$;

create or replace function public.mark_opportunity_posted(
  p_opportunity_id uuid,
  p_posted_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  if p_posted_at is null or p_posted_at > now() + interval '5 minutes' then
    raise exception 'INVALID_POSTED_AT' using errcode = '22023';
  end if;

  update public.opportunities
  set status = 'posted',
      posted_at = p_posted_at,
      skipped_reason = null
  where id = p_opportunity_id
    and user_id = auth.uid()
    and status in ('new', 'drafted');
  return found;
end;
$$;

revoke all on function public.skip_opportunity(uuid, text) from public, anon;
revoke all on function public.mark_opportunity_posted(uuid, timestamptz) from public, anon;
grant execute on function public.skip_opportunity(uuid, text) to authenticated;
grant execute on function public.mark_opportunity_posted(uuid, timestamptz) to authenticated;

comment on function public.skip_opportunity(uuid, text)
is 'Lets an authenticated owner skip a qualified opportunity without direct table update permission.';
comment on function public.mark_opportunity_posted(uuid, timestamptz)
is 'Records a user-reported manual post; it never calls a platform write API.';