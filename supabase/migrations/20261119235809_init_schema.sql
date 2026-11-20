-- ===== Profiles (created automatically at signup) =====
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(split_part(new.email, '@', 1), ''), 40));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Photos =====
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  original_path text not null,
  preview_path text not null,
  thumb_path text not null,
  width integer not null check (width between 1 and 20000),
  height integer not null check (height between 1 and 20000),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  rating smallint not null default 0 check (rating between 0 and 5),
  flag text not null default 'none' check (flag in ('none', 'pick', 'reject')),
  color_label text not null default 'none'
    check (color_label in ('none', 'red', 'yellow', 'green', 'blue', 'purple')),
  created_at timestamptz not null default now()
);
create index photos_owner_created_idx on public.photos (owner_id, created_at desc);

-- Free storage is 1 GB, so cap each user at 30 photos
create function public.enforce_photo_quota()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if (select count(*) from public.photos where owner_id = new.owner_id) >= 30 then
    raise exception 'Photo limit reached (30). Delete a photo to upload another.';
  end if;
  return new;
end;
$$;

create trigger photos_quota
  before insert on public.photos
  for each row execute function public.enforce_photo_quota();

-- ===== Edits, versions, presets =====
create table public.edits (
  photo_id uuid primary key references public.photos (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (octet_length(settings::text) <= 20000),
  updated_at timestamptz not null default now()
);

create table public.edit_versions (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  settings jsonb not null check (octet_length(settings::text) <= 20000),
  created_at timestamptz not null default now()
);
create index edit_versions_photo_idx on public.edit_versions (photo_id, created_at desc);

create table public.presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid() references auth.users (id) on delete cascade, -- null = built-in
  name text not null check (char_length(name) between 1 and 60),
  settings jsonb not null check (octet_length(settings::text) <= 20000),
  created_at timestamptz not null default now()
);

-- ===== Albums and tags =====
create table public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.album_photos (
  album_id uuid not null references public.albums (id) on delete cascade,
  photo_id uuid not null references public.photos (id) on delete cascade,
  primary key (album_id, photo_id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  unique (owner_id, name)
);

create table public.photo_tags (
  photo_id uuid not null references public.photos (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (photo_id, tag_id)
);

-- ===== Share links (read by an Edge Function, never directly by the public) =====
create table public.share_links (
  token uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ===== Row-level security: everything is owner-only =====
alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.edits enable row level security;
alter table public.edit_versions enable row level security;
alter table public.presets enable row level security;
alter table public.albums enable row level security;
alter table public.album_photos enable row level security;
alter table public.tags enable row level security;
alter table public.photo_tags enable row level security;
alter table public.share_links enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "photos: own" on public.photos
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "edits: own" on public.edits
  for all to authenticated
  using (exists (select 1 from public.photos p where p.id = photo_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.photos p where p.id = photo_id and p.owner_id = (select auth.uid())));

create policy "edit_versions: own" on public.edit_versions
  for all to authenticated
  using (exists (select 1 from public.photos p where p.id = photo_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.photos p where p.id = photo_id and p.owner_id = (select auth.uid())));

create policy "presets: read built-in and own" on public.presets
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "presets: write own" on public.presets
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "presets: update own" on public.presets
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "presets: delete own" on public.presets
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "albums: own" on public.albums
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "album_photos: own" on public.album_photos
  for all to authenticated
  using (
    exists (select 1 from public.albums a where a.id = album_id and a.owner_id = (select auth.uid()))
    and exists (select 1 from public.photos p where p.id = photo_id and p.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.albums a where a.id = album_id and a.owner_id = (select auth.uid()))
    and exists (select 1 from public.photos p where p.id = photo_id and p.owner_id = (select auth.uid()))
  );

create policy "tags: own" on public.tags
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "photo_tags: own" on public.photo_tags
  for all to authenticated
  using (
    exists (select 1 from public.tags t where t.id = tag_id and t.owner_id = (select auth.uid()))
    and exists (select 1 from public.photos p where p.id = photo_id and p.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.tags t where t.id = tag_id and t.owner_id = (select auth.uid()))
    and exists (select 1 from public.photos p where p.id = photo_id and p.owner_id = (select auth.uid()))
  );

create policy "share_links: own" on public.share_links
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ===== Privileges: signed-out visitors get nothing =====
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ===== Private storage bucket: 10 MB images only, each user limited to their own folder =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "photos bucket: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos bucket: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos bucket: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos bucket: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);