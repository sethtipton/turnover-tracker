alter table public.items
  add constraint items_material_type_matches_kind check (
    (kind = 'material' and material_type is not null)
    or (kind <> 'material' and material_type is null)
  );
