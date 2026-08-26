create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'analyst' check (role in ('admin','manager','analyst')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text not null,
  source text not null default 'PNCP',
  source_url text,
  title text not null,
  buyer_name text,
  buyer_cnpj text,
  city text,
  state text,
  sphere text,
  process_number text,
  modality text,
  object_text text,
  estimated_value numeric(18,2),
  published_at timestamptz,
  deadline_at timestamptz,
  status text not null default 'Novo' check (status in ('Novo','Em análise','Interessante','Participaremos','Documentação','Proposta em elaboração','Enviado','Aguardando resultado','Ganho','Perdido','Descartado')),
  score integer not null default 0 check (score between 0 and 100),
  ai_summary text,
  raw_payload jsonb,
  is_favorite boolean not null default false,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source, external_id)
);

create index if not exists opportunities_org_idx on public.opportunities(organization_id);
create index if not exists opportunities_score_idx on public.opportunities(score desc);
create index if not exists opportunities_deadline_idx on public.opportunities(deadline_at);
create index if not exists opportunities_value_idx on public.opportunities(estimated_value desc);
create index if not exists opportunities_status_idx on public.opportunities(status);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.opportunities enable row level security;

create policy "members can read own organization"
on public.organizations for select
to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organizations.id
      and m.user_id = (select auth.uid())
  )
);

create policy "members can read own membership"
on public.organization_members for select
to authenticated
using (user_id = (select auth.uid()));

create policy "members can read organization opportunities"
on public.opportunities for select
to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = opportunities.organization_id
      and m.user_id = (select auth.uid())
  )
);

create policy "members can update organization opportunities"
on public.opportunities for update
to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = opportunities.organization_id
      and m.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = opportunities.organization_id
      and m.user_id = (select auth.uid())
  )
);

comment on table public.opportunities is 'Radar de editais e oportunidades jurídicas do Nuvy Pulse.';
