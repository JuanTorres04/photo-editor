-- Each photo can keep at most 20 saved versions
create function public.enforce_version_quota()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if (select count(*) from public.edit_versions where photo_id = new.photo_id) >= 20 then
    raise exception 'Version limit reached (20). Delete a version to save another.';
  end if;
  return new;
end;
$$;

create trigger edit_versions_quota
  before insert on public.edit_versions
  for each row execute function public.enforce_version_quota();