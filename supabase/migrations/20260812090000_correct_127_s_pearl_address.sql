begin;

-- Correct the property record and preserve its existing UUID, units,
-- memberships, maintenance requests, and QR codes.
update public.properties property
set name = '127 S Pearl',
    street_address = '127 S Pearl St.',
    updated_at = now()
from public.workspaces workspace
where property.workspace_id = workspace.id
  and workspace.name = 'Tipton Rentals'
  and property.name = '127 S Pearl';

commit;
