create table public.drafts (
  id uuid primary key default extensions.gen_random_uuid(), user_id uuid not null references public.user_profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade, generation_number integer not null check (generation_number > 0),
  generated_text text not null check (char_length(btrim(generated_text)) between 1 and 3000), edited_text text not null check (char_length(btrim(edited_text)) between 1 and 3000),
  prompt_version text not null check (char_length(btrim(prompt_version)) between 1 and 100), is_current boolean not null default true,
  version integer not null default 1 check (version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (opportunity_id, generation_number)
);
create unique index drafts_one_current_per_opportunity_idx on public.drafts (opportunity_id) where is_current;
create index drafts_owner_updated_idx on public.drafts (user_id, updated_at desc);
create trigger drafts_set_updated_at before update on public.drafts for each row execute function public.set_updated_at();

create table public.operations (
  id uuid primary key default extensions.gen_random_uuid(), request_key uuid not null unique,
  user_id uuid not null references public.user_profiles(id) on delete cascade, opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  usage_event_id uuid not null unique references public.usage_events(id) on delete cascade, operation_type text not null check (operation_type = 'draft'),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')), generation_number integer not null check (generation_number > 0),
  prompt_version text not null check (char_length(btrim(prompt_version)) between 1 and 100), result_draft_id uuid references public.drafts(id) on delete set null,
  error_code text check (error_code is null or char_length(error_code) between 1 and 100), created_at timestamptz not null default now(), started_at timestamptz,
  completed_at timestamptz, updated_at timestamptz not null default now(),
  constraint operation_terminal_state check (
    (status in ('queued', 'running') and completed_at is null and result_draft_id is null and error_code is null)
    or (status = 'succeeded' and completed_at is not null and result_draft_id is not null and error_code is null)
    or (status = 'failed' and completed_at is not null and result_draft_id is null and error_code is not null)
  )
);
create unique index operations_one_active_draft_idx on public.operations (opportunity_id) where status in ('queued', 'running');
create index operations_owner_created_idx on public.operations (user_id, created_at desc);
create trigger operations_set_updated_at before update on public.operations for each row execute function public.set_updated_at();

alter table public.drafts enable row level security; alter table public.operations enable row level security;
create policy "drafts_select_own" on public.drafts for select to authenticated using ((select auth.uid()) = user_id);
create policy "operations_select_own" on public.operations for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.drafts from anon, authenticated; revoke all on public.operations from anon, authenticated;
grant select on public.drafts to authenticated; grant select on public.operations to authenticated;
grant all on public.drafts to service_role; grant all on public.operations to service_role;

create or replace function public.request_draft_generation(p_opportunity_id uuid, p_prompt_version text, p_request_key uuid, p_regenerate boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare opp public.opportunities%rowtype; existing_op public.operations%rowtype; current_draft public.drafts%rowtype;
  period_id uuid; quota integer; used integer; generation integer; usage_id uuid; op_id uuid; lease uuid := extensions.gen_random_uuid();
begin
  if auth.uid() is null then return jsonb_build_object('status', 'not_found'); end if;
  if char_length(btrim(p_prompt_version)) not between 1 and 100 or p_request_key is null then raise exception 'INVALID_DRAFT_REQUEST' using errcode = '22023'; end if;
  select * into existing_op from public.operations where request_key = p_request_key and user_id = auth.uid();
  if found then return jsonb_build_object('status', existing_op.status, 'operation_id', existing_op.id); end if;
  select * into opp from public.opportunities where id = p_opportunity_id and user_id = auth.uid() for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if opp.status not in ('new', 'drafted') or coalesce(opp.intent_score, 0) < 60 then return jsonb_build_object('status', 'not_eligible'); end if;
  select * into existing_op from public.operations where opportunity_id = p_opportunity_id and status in ('queued', 'running') order by created_at desc limit 1;
  if found then return jsonb_build_object('status', existing_op.status, 'operation_id', existing_op.id); end if;
  select * into current_draft from public.drafts where opportunity_id = p_opportunity_id and is_current;
  if found and not p_regenerate then return jsonb_build_object('status', 'already_completed', 'draft_id', current_draft.id); end if;
  select periods.id, entitlements.draft_limit into period_id, quota from public.user_entitlement_periods periods
  join public.plan_entitlements entitlements on entitlements.id = periods.plan_entitlement_id
  where periods.user_id = auth.uid() and periods.status = 'active' and periods.starts_at <= now()
    and (periods.ends_at is null or periods.ends_at > now()) and entitlements.effective_at <= now()
    and (entitlements.retired_at is null or entitlements.retired_at > now()) order by periods.starts_at desc limit 1 for update of periods;
  if period_id is null then return jsonb_build_object('status', 'no_entitlement'); end if;
  select coalesce(sum(quantity), 0)::integer into used from public.usage_events where entitlement_period_id = period_id and usage_type = 'draft' and status in ('reserved', 'consumed');
  if used >= quota then return jsonb_build_object('status', 'quota_exhausted'); end if;
  select coalesce(max(generation_number), 0) + 1 into generation from public.operations where opportunity_id = p_opportunity_id;
  insert into public.usage_events (user_id, entitlement_period_id, usage_type, quantity, operation_key, status, opportunity_id, lease_token, lease_expires_at)
  values (auth.uid(), period_id, 'draft', 1, 'draft-request:' || p_request_key::text, 'reserved', p_opportunity_id, lease, now() + interval '30 minutes') returning id into usage_id;
  insert into public.operations (request_key, user_id, opportunity_id, usage_event_id, operation_type, status, generation_number, prompt_version)
  values (p_request_key, auth.uid(), p_opportunity_id, usage_id, 'draft', 'queued', generation, btrim(p_prompt_version)) returning id into op_id;
  return jsonb_build_object('status', 'queued', 'operation_id', op_id);
end; $$;

create or replace function public.cancel_draft_request(p_operation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$ declare usage_id uuid; begin
  update public.operations set status = 'failed', error_code = 'QUEUE_UNAVAILABLE', completed_at = now()
  where id = p_operation_id and user_id = auth.uid() and status = 'queued' returning usage_event_id into usage_id;
  if usage_id is null then return false; end if;
  update public.usage_events set status = 'released', lease_token = null, lease_expires_at = null, released_at = now() where id = usage_id and status = 'reserved'; return true;
end; $$;

create or replace function public.begin_draft_operation(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare op public.operations%rowtype; usage_row public.usage_events%rowtype; opp public.opportunities%rowtype; product public.products%rowtype; post public.scanned_posts%rowtype;
begin
  select * into op from public.operations where id = p_operation_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if op.status = 'succeeded' then return jsonb_build_object('status', 'already_completed'); end if;
  if op.status <> 'queued' then return jsonb_build_object('status', 'not_eligible'); end if;
  select * into usage_row from public.usage_events where id = op.usage_event_id for update;
  if usage_row.status <> 'reserved' or usage_row.lease_expires_at <= now() then
    update public.operations set status = 'failed', error_code = 'RESERVATION_EXPIRED', completed_at = now() where id = op.id;
    return jsonb_build_object('status', 'not_eligible'); end if;
  select * into opp from public.opportunities where id = op.opportunity_id;
  select * into product from public.products where id = opp.product_id and is_active and deleted_at is null;
  select * into post from public.scanned_posts where id = opp.scanned_post_id;
  if opp.id is null or product.id is null or post.id is null then return jsonb_build_object('status', 'not_eligible'); end if;
  update public.operations set status = 'running', started_at = now() where id = op.id;
  return jsonb_build_object('status', 'claimed', 'operation_id', op.id, 'usage_event_id', usage_row.id, 'lease_token', usage_row.lease_token,
    'attempt_number', usage_row.attempt_count, 'generation_number', op.generation_number, 'prompt_version', op.prompt_version,
    'target', jsonb_build_object('opportunity_id', opp.id, 'user_id', opp.user_id, 'product_id', product.id, 'product_name', product.name,
      'product_description', product.description, 'voice_persona', product.voice_persona, 'platform', post.platform, 'subreddit', post.subreddit,
      'title', post.title, 'body', post.body, 'classification_reason', opp.reasoning));
end; $$;

create or replace function public.complete_draft_operation(p_operation_id uuid, p_lease_token uuid, p_ai_call_id uuid, p_draft_text text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare op public.operations%rowtype; usage_row public.usage_events%rowtype; draft_id uuid;
begin
  if char_length(btrim(coalesce(p_draft_text, ''))) not between 1 and 3000 then raise exception 'INVALID_DRAFT_TEXT' using errcode = '22023'; end if;
  select * into op from public.operations where id = p_operation_id for update; if not found or op.status <> 'running' then return null; end if;
  select * into usage_row from public.usage_events where id = op.usage_event_id for update;
  if usage_row.status <> 'reserved' or usage_row.lease_token <> p_lease_token or usage_row.lease_expires_at <= now() then return null; end if;
  update public.drafts set is_current = false where opportunity_id = op.opportunity_id and is_current;
  insert into public.drafts (user_id, opportunity_id, generation_number, generated_text, edited_text, prompt_version)
  values (op.user_id, op.opportunity_id, op.generation_number, btrim(p_draft_text), btrim(p_draft_text), op.prompt_version) returning id into draft_id;
  update public.opportunities set status = 'drafted', posted_at = null, skipped_reason = null where id = op.opportunity_id;
  update public.usage_events set status = 'consumed', lease_token = null, lease_expires_at = null, ai_call_id = p_ai_call_id, consumed_at = now(), released_at = null where id = usage_row.id;
  update public.operations set status = 'succeeded', result_draft_id = draft_id, completed_at = now() where id = op.id; return draft_id;
end; $$;

create or replace function public.fail_draft_operation(p_operation_id uuid, p_error_code text)
returns boolean language plpgsql security definer set search_path = '' as $$ declare usage_id uuid; begin
  update public.operations set status = 'failed', error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'DRAFT_FAILED'), 100), completed_at = now()
  where id = p_operation_id and status in ('queued', 'running') returning usage_event_id into usage_id;
  if usage_id is null then return false; end if;
  update public.usage_events set status = 'released', lease_token = null, lease_expires_at = null, released_at = now() where id = usage_id and status = 'reserved'; return true;
end; $$;

create or replace function public.update_draft_text(p_draft_id uuid, p_expected_version integer, p_edited_text text)
returns jsonb language plpgsql security definer set search_path = '' as $$ declare updated public.drafts%rowtype; begin
  if auth.uid() is null then return jsonb_build_object('status', 'not_found'); end if;
  if char_length(btrim(coalesce(p_edited_text, ''))) not between 1 and 3000 then raise exception 'INVALID_DRAFT_TEXT' using errcode = '22023'; end if;
  update public.drafts set edited_text = btrim(p_edited_text), version = version + 1 where id = p_draft_id and user_id = auth.uid() and is_current and version = p_expected_version returning * into updated;
  if found then return jsonb_build_object('status', 'updated', 'draft', to_jsonb(updated)); end if;
  if exists (select 1 from public.drafts where id = p_draft_id and user_id = auth.uid()) then return jsonb_build_object('status', 'conflict'); end if;
  return jsonb_build_object('status', 'not_found');
end; $$;

revoke all on function public.request_draft_generation(uuid, text, uuid, boolean) from public, anon;
revoke all on function public.cancel_draft_request(uuid) from public, anon;
revoke all on function public.update_draft_text(uuid, integer, text) from public, anon;
grant execute on function public.request_draft_generation(uuid, text, uuid, boolean) to authenticated;
grant execute on function public.cancel_draft_request(uuid) to authenticated;
grant execute on function public.update_draft_text(uuid, integer, text) to authenticated;
revoke all on function public.begin_draft_operation(uuid) from public, anon, authenticated;
revoke all on function public.complete_draft_operation(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_draft_operation(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_draft_operation(uuid) to service_role;
grant execute on function public.complete_draft_operation(uuid, uuid, uuid, text) to service_role;
grant execute on function public.fail_draft_operation(uuid, text) to service_role;