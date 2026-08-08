begin;
select plan(21);

select ok(
  not has_function_privilege('anon', 'public.get_my_maintenance_qr_context(text)', 'execute'),
  'anonymous callers cannot execute the QR unit-context resolver'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant-a@example.test', '', now(), '{"provider":"google"}', '{}'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tenant-b@example.test', '', now(), '{"provider":"google"}', '{}'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'property-admin@example.test', '', now(), '{"provider":"google"}', '{}')
on conflict (id) do nothing;

insert into public.workspaces (id, name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Phase 4 RLS test workspace')
on conflict (id) do nothing;

insert into public.properties (id, workspace_id, name)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Phase 4 RLS property')
on conflict (id) do nothing;

insert into public.properties (id, workspace_id, name)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Unassigned property')
on conflict (id) do nothing;

insert into public.units (id, workspace_id, property_id, name)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'A'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'B')
on conflict (id) do nothing;

insert into public.tenant_memberships (id, workspace_id, property_id, unit_id, email, user_id)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'tenant-a@example.test', '11111111-1111-1111-1111-111111111111'),
  ('ffffffff-ffff-ffff-ffff-fffffffffff1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'dddddddd-dddd-dddd-dddd-ddddddddddd1', 'tenant-b@example.test', '22222222-2222-2222-2222-222222222222')
on conflict (id) do update set active = true;

insert into public.property_members (workspace_id, property_id, email, role)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'property-admin@example.test', 'admin')
on conflict (property_id, email) do update set role = excluded.role;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","email":"tenant-a@example.test","role":"authenticated"}', true);
set local role authenticated;

insert into public.maintenance_requests (
  id, workspace_id, property_id, unit_id, tenant_membership_id, source_type, submitter_id, submitter_email, title, original_description
) values (
  '99999999-9999-9999-9999-999999999991', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'tenant-text', '11111111-1111-1111-1111-111111111111', 'tenant-a@example.test', 'Tenant A request', 'The fan is loud.'
);

select ok(exists (select 1 from public.maintenance_requests where id = '99999999-9999-9999-9999-999999999991'), 'tenant A can read their own request');

select ok(exists (
  select 1
  from public.get_my_maintenance_qr_context((
    select maintenance_qr_token
    from public.units
    where id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
  )) context
  where context.tenant_membership_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1'
    and context.access_role = 'tenant'
), 'tenant A can resolve their own unit QR code');

insert into public.maintenance_request_entries (
  id, maintenance_request_id, author_type, author_id, author_email, entry_type, visibility, content
) values (
  '12121212-1212-1212-1212-121212121211', '99999999-9999-9999-9999-999999999991', 'tenant', '11111111-1111-1111-1111-111111111111', 'tenant-a@example.test', 'note', 'tenant', 'It is louder at night.'
);

select ok(exists (select 1 from public.maintenance_request_entries where id = '12121212-1212-1212-1212-121212121211'), 'tenant A can append their own request history');

insert into public.maintenance_attachments (
  maintenance_request_id, entry_id, visibility, kind, file_name, mime_type, storage_path
) values (
  '99999999-9999-9999-9999-999999999991', '12121212-1212-1212-1212-121212121211', 'tenant', 'photo', 'fan.jpg', 'image/jpeg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/99999999-9999-9999-9999-999999999991/12121212-1212-1212-1212-121212121211/fan.jpg'
);

select ok(exists (select 1 from public.maintenance_attachments where maintenance_request_id = '99999999-9999-9999-9999-999999999991'), 'tenant A can attach a file to their own entry');

reset role;
insert into public.maintenance_request_entries (
  id, maintenance_request_id, author_type, author_id, author_email, entry_type, visibility, content
) values (
  '13131313-1313-1313-1313-131313131311', '99999999-9999-9999-9999-999999999991', 'admin', '33333333-3333-3333-3333-333333333333', 'property-admin@example.test', 'note', 'admin', 'Internal troubleshooting note.'
);
insert into public.maintenance_attachments (
  maintenance_request_id, entry_id, visibility, kind, file_name, mime_type, storage_path
) values (
  '99999999-9999-9999-9999-999999999991', '13131313-1313-1313-1313-131313131311', 'admin', 'photo', 'internal.jpg', 'image/jpeg', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1/99999999-9999-9999-9999-999999999991/13131313-1313-1313-1313-131313131311/internal.jpg'
);
set local role authenticated;

select is_empty('select * from public.maintenance_request_entries where id = ''13131313-1313-1313-1313-131313131311''', 'tenant A cannot read admin-only request notes');
select is_empty('select * from public.maintenance_attachments where file_name = ''internal.jpg''', 'tenant A cannot read admin-only request attachments');
select is_empty('select * from public.items', 'tenant A cannot read operational items');
select is_empty('select * from public.activity_log', 'tenant A cannot read internal activity');
select is_empty('select * from public.workspace_members', 'tenant A cannot read workspace members');
select is_empty('select * from public.property_members', 'tenant A cannot read property members');
select is_empty('select * from public.maintenance_analyses', 'tenant A cannot read immutable AI analyses');

reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"tenant-b@example.test","role":"authenticated"}', true);
set local role authenticated;

select is_empty(
  'select * from public.maintenance_requests where id = ''99999999-9999-9999-9999-999999999991''',
  'tenant B cannot read tenant A request, even in the same property'
);

select is_empty(
  $$select * from public.get_my_maintenance_qr_context((select maintenance_qr_token from public.units where id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'))$$,
  'tenant B cannot resolve tenant A unit details from a copied QR token'
);

select throws_ok(
  $$insert into public.maintenance_requests (workspace_id, property_id, unit_id, tenant_membership_id, source_type, submitter_id, submitter_email, title) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 'tenant-qr', '22222222-2222-2222-2222-222222222222', 'tenant-b@example.test', 'Forged QR request')$$,
  '42501',
  null,
  'tenant B cannot submit against tenant A unit with a copied QR link'
);

select throws_ok(
  $$insert into public.items (workspace_id, property_id, unit_id, title, kind, status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'dddddddd-dddd-dddd-dddd-ddddddddddd1', 'Unauthorized work', 'task', 'approved')$$,
  '42501',
  null,
  'tenant B cannot create approved internal work items'
);

select throws_ok(
  $$update public.maintenance_requests set unit_id = 'dddddddd-dddd-dddd-dddd-ddddddddddd1' where id = '99999999-9999-9999-9999-999999999991'$$,
  '42501',
  null,
  'tenant B cannot alter another tenant request scope'
);

reset role;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","email":"property-admin@example.test","role":"authenticated"}', true);
set local role authenticated;
select ok(exists (select 1 from public.maintenance_requests where id = '99999999-9999-9999-9999-999999999991'), 'property admin can read a request in their authorized property');
select ok(exists (select 1 from public.workspaces where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'), 'property admin can read only enough workspace metadata to reach the maintenance console');
select is_empty('select * from public.properties where id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2''', 'property admin cannot read unassigned properties');
select ok(exists (
  select 1
  from public.get_my_maintenance_qr_context((
    select maintenance_qr_token
    from public.units
    where id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'
  )) context
  where context.access_role = 'admin'
), 'property admin can resolve a QR code for an authorized property');

select * from finish();
rollback;
