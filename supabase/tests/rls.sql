begin;
select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.com', '', now(), '{}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.com', '', now(), '{}', '{}', now(), now());

select is((select count(*)::integer from public.user_profiles where id in (
  '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'
)), 2, 'auth users receive profiles');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select is((select count(*)::integer from public.user_profiles), 1, 'user one sees only their profile');

insert into public.products (id, user_id, name, description, keywords)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'One product', 'Owned by user one', array['one']);

select is((select count(*)::integer from public.products), 1, 'user one sees their product');
select is((select entitlement_status from public.user_profiles), 'active', 'first product activates verified trial');
select ok((select trial_ends_at = trial_started_at + interval '14 days' from public.user_profiles), 'trial lasts 14 days');

select throws_ok(
  $$insert into public.products (user_id, name, description, keywords) values ('22222222-2222-4222-8222-222222222222', 'Stolen', 'Should fail', array['bad'])$$,
  '42501',
  'new row violates row-level security policy for table "products"',
  'user one cannot insert for user two'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select is((select count(*)::integer from public.products), 0, 'user two cannot see user one product');

update public.products set name = 'Tampered' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is((select count(*)::integer from public.products), 0, 'user two cannot update user one product');

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is((select name from public.products where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'One product', 'cross-user update changed nothing');

select * from finish();
rollback;
