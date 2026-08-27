create table if not exists public.raw_notices (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  source_url text,
  title text,
  buyer_name text,
  city text,
  state text,
  modality text,
  process_number text,
  estimated_value numeric(18,2),
  published_at timestamptz,
  deadline_at timestamptz,
  payload jsonb not null,
  payload_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(source,external_id)
);

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check(status in ('running','success','partial','error')),
  scanned integer not null default 0,
  inserted_raw integer not null default 0,
  updated_raw integer not null default 0,
  qualified integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.source_health (
  source text primary key,
  category text not null default 'built_in',
  enabled boolean not null default true,
  status text not null default 'unknown' check(status in ('unknown','online','degraded','offline')),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_scanned integer not null default 0,
  last_qualified integer not null default 0,
  avg_duration_ms numeric(12,2),
  updated_at timestamptz not null default now()
);

alter table public.opportunities add column if not exists raw_notice_id uuid references public.raw_notices(id) on delete set null;
alter table public.opportunities add column if not exists legal_relevant boolean not null default true;
alter table public.opportunities add column if not exists qualification_reason jsonb not null default '{}'::jsonb;

create index if not exists raw_notices_source_seen_idx on public.raw_notices(source,last_seen_at desc);
create index if not exists raw_notices_geo_idx on public.raw_notices(state,city);
create index if not exists raw_notices_value_idx on public.raw_notices(estimated_value desc);
create index if not exists ingestion_runs_source_started_idx on public.ingestion_runs(source,started_at desc);
create index if not exists opportunities_raw_notice_idx on public.opportunities(raw_notice_id);

alter table public.raw_notices enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.source_health enable row level security;

revoke all on public.raw_notices from anon, authenticated;
revoke all on public.ingestion_runs from anon, authenticated;
revoke all on public.source_health from anon, authenticated;

do $$ begin create policy "authenticated read raw notices" on public.raw_notices for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy "authenticated read ingestion runs" on public.ingestion_runs for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy "authenticated read source health" on public.source_health for select to authenticated using(true); exception when duplicate_object then null; end $$;

grant select on public.raw_notices to authenticated;
grant select on public.ingestion_runs to authenticated;
grant select on public.source_health to authenticated;

insert into public.source_health(source,category,enabled,status)
values ('PNCP','built_in',true,'unknown'),('Compras.gov.br Legado','built_in',true,'unknown')
on conflict(source) do nothing;
