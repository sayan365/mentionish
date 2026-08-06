create or replace function public.get_my_usage()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  select jsonb_build_object(
    'plan', entitlements.plan,
    'entitlement_status', periods.status,
    'period', jsonb_build_object('starts_at', periods.starts_at, 'ends_at', periods.ends_at),
    'classification', jsonb_build_object(
      'used', coalesce(usage.classification_used, 0), 'reserved', coalesce(usage.classification_reserved, 0),
      'limit', entitlements.classification_limit,
      'remaining', greatest(entitlements.classification_limit - coalesce(usage.classification_used, 0) - coalesce(usage.classification_reserved, 0), 0),
      'resets_at', case when entitlements.reset_cadence = 'monthly' then periods.ends_at else null end),
    'draft', jsonb_build_object(
      'used', coalesce(usage.draft_used, 0), 'reserved', coalesce(usage.draft_reserved, 0),
      'limit', entitlements.draft_limit,
      'remaining', greatest(entitlements.draft_limit - coalesce(usage.draft_used, 0) - coalesce(usage.draft_reserved, 0), 0),
      'resets_at', case when entitlements.reset_cadence = 'monthly' then periods.ends_at else null end),
    'products', jsonb_build_object(
      'active', (select count(*)::integer from public.products where user_id = auth.uid() and is_active and deleted_at is null),
      'limit', entitlements.active_product_limit)
  ) into result
  from public.user_entitlement_periods periods
  join public.plan_entitlements entitlements on entitlements.id = periods.plan_entitlement_id
  left join lateral (
    select
      coalesce(sum(quantity) filter (where usage_type = 'classification' and status = 'consumed'), 0)::integer classification_used,
      coalesce(sum(quantity) filter (where usage_type = 'classification' and status = 'reserved'), 0)::integer classification_reserved,
      coalesce(sum(quantity) filter (where usage_type = 'draft' and status = 'consumed'), 0)::integer draft_used,
      coalesce(sum(quantity) filter (where usage_type = 'draft' and status = 'reserved'), 0)::integer draft_reserved
    from public.usage_events
    where entitlement_period_id = periods.id and user_id = auth.uid()
  ) usage on true
  where periods.user_id = auth.uid() and periods.status = 'active'
    and periods.starts_at <= now() and (periods.ends_at is null or periods.ends_at > now())
  order by periods.starts_at desc limit 1;
  if result is null then return jsonb_build_object('status', 'no_entitlement'); end if;
  return result;
end;
$$;

create or replace function public.get_my_analytics_summary(p_product_id uuid default null, p_window_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_window_days not in (7, 30) then raise exception 'INVALID_ANALYTICS_WINDOW' using errcode = '22023'; end if;
  if p_product_id is not null and not exists (
    select 1 from public.products where id = p_product_id and user_id = auth.uid() and deleted_at is null
  ) then return jsonb_build_object('status', 'not_found'); end if;

  with owned as (
    select opportunities.*, scanned_posts.platform
    from public.opportunities
    join public.scanned_posts on scanned_posts.id = opportunities.scanned_post_id
    where opportunities.user_id = auth.uid() and (p_product_id is null or opportunities.product_id = p_product_id)
  ), metrics as (
    select
      count(*) filter (where created_at >= now() - make_interval(days => p_window_days))::integer found,
      count(*) filter (where classified_at >= now() - make_interval(days => p_window_days) and intent_score >= 60)::integer qualified,
      count(*) filter (where posted_at >= now() - make_interval(days => p_window_days))::integer posted,
      count(*) filter (where updated_at >= now() - make_interval(days => p_window_days) and status = 'skipped' and skipped_reason = 'Not relevant right now.')::integer skipped
    from owned
  ), drafted as (
    select count(distinct drafts.opportunity_id)::integer value
    from public.drafts join owned on owned.id = drafts.opportunity_id
    where drafts.created_at >= now() - make_interval(days => p_window_days)
  ), platforms as (
    select coalesce(jsonb_object_agg(platform, total), '{}'::jsonb) value
    from (
      select platform, count(*)::integer total from owned
      where classified_at >= now() - make_interval(days => p_window_days) and intent_score >= 60
      group by platform
    ) grouped
  )
  select jsonb_build_object(
    'window_days', p_window_days, 'product_id', p_product_id, 'found', metrics.found,
    'qualified', metrics.qualified, 'drafted', drafted.value, 'posted', metrics.posted,
    'skipped', metrics.skipped,
    'draft_to_post_percent', case when drafted.value = 0 then 0 else round((metrics.posted::numeric / drafted.value::numeric) * 100, 1) end,
    'platforms', platforms.value
  ) into result from metrics cross join drafted cross join platforms;
  return result;
end;
$$;

revoke all on function public.get_my_usage() from public, anon;
revoke all on function public.get_my_analytics_summary(uuid, integer) from public, anon;
grant execute on function public.get_my_usage() to authenticated;
grant execute on function public.get_my_analytics_summary(uuid, integer) to authenticated;

comment on function public.get_my_usage() is 'Returns the authenticated user current versioned entitlement and atomic usage totals.';
comment on function public.get_my_analytics_summary(uuid, integer) is 'Returns owned 7/30-day workflow analytics; posted is always user-declared.';