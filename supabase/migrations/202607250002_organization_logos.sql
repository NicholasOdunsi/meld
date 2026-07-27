alter table public.organizations
add column logo_path text
check (
  logo_path is null
  or char_length(logo_path) between 1 and 500
);

drop function public.create_organization_with_product(text, text);

create function public.create_organization_with_product(
  organization_name text,
  product_name text,
  organization_logo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_organization public.organizations;
  created_product public.products;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  organization_name := btrim(organization_name);
  product_name := btrim(product_name);
  organization_logo_path := nullif(btrim(organization_logo_path), '');

  if organization_name is null
    or char_length(organization_name) not between 1 and 120
    or product_name is null
    or char_length(product_name) not between 1 and 120
    or (
      organization_logo_path is not null
      and (
        char_length(organization_logo_path) > 500
        or organization_logo_path
          not like current_user_id::text || '/%'
      )
    )
  then
    raise exception 'Organization details are invalid'
      using errcode = 'P0001';
  end if;

  insert into public.organizations (name, logo_path, created_by)
  values (
    organization_name,
    organization_logo_path,
    current_user_id
  )
  returning * into created_organization;

  insert into public.products (organization_id, name)
  values (created_organization.id, product_name)
  returning * into created_product;

  return jsonb_build_object(
    'organization_id', created_organization.id,
    'organization_name', created_organization.name,
    'organization_logo_path', created_organization.logo_path,
    'product_id', created_product.id,
    'product_name', created_product.name
  );
end;
$$;

revoke all
  on function public.create_organization_with_product(text, text, text)
  from public;

grant execute
  on function public.create_organization_with_product(text, text, text)
  to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'organization-logos',
  'organization-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Organization logos are publicly readable"
on storage.objects for select to public
using (bucket_id = 'organization-logos');

create policy "Users can upload organization logos in their folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'organization-logos'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update organization logos in their folder"
on storage.objects for update to authenticated
using (
  bucket_id = 'organization-logos'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'organization-logos'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete organization logos in their folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'organization-logos'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);
