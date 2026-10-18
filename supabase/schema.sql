-- VTT Lite cloud: run once in Supabase → SQL Editor → New query → Run.
-- Safe to run again: everything is "if not exists" / replaced.

-- Scenes, assets and collections as JSON documents, one row per document and owner.
create table if not exists public.vtt_docs (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('collection', 'asset', 'scene')),
  id text not null,
  data jsonb,
  updated_at bigint not null,          -- the document's own change time (ms)
  deleted boolean not null default false,
  synced_at timestamptz not null default now(), -- server time of the last write, the pull cursor
  primary key (owner, kind, id)
);

create index if not exists vtt_docs_synced on public.vtt_docs (owner, synced_at);

-- Stamps the pull cursor; an older version never replaces a newer one (offline devices).
create or replace function public.vtt_docs_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists vtt_docs_touch on public.vtt_docs;
create trigger vtt_docs_touch before insert or update on public.vtt_docs
for each row execute function public.vtt_docs_touch();

-- Everyone sees and changes only their own rows.
alter table public.vtt_docs enable row level security;

drop policy if exists "vtt docs: owner only" on public.vtt_docs;
create policy "vtt docs: owner only" on public.vtt_docs
  for all to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

-- Original images and thumbnails: private bucket, files under <user id>/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('vtt-files', 'vtt-files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "vtt files: owner only" on storage.objects;
create policy "vtt files: owner only" on storage.objects
  for all to authenticated
  using (bucket_id = 'vtt-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'vtt-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
