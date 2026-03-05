-- InterCampus standalone module schema
-- Uses only profiles from existing schema. All tables are prefixed with intercampus_.

create extension if not exists pgcrypto;

create table if not exists public.intercampus_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  college_name text not null,
  college_location text,
  college_website text,
  fest_name text,
  event_start_date timestamptz,
  event_end_date timestamptz,
  event_type text,
  participation_type text check (participation_type in ('individual', 'team')),
  min_team_size integer,
  max_team_size integer,
  venue text,
  is_online boolean default false,
  registration_link text,
  registration_deadline timestamptz,
  eligibility_text text,
  banner_image text,
  faculty_notes text,
  participation_cap integer,
  verification_status text default 'pending',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.intercampus_event_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references public.profiles(id),
  event_title text,
  event_description text,
  college_name text,
  college_location text,
  college_website text,
  fest_name text,
  event_start_date timestamptz,
  event_end_date timestamptz,
  registration_link text,
  participation_type text,
  min_team_size integer,
  max_team_size integer,
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists public.intercampus_interested_users (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.intercampus_events(id) on delete cascade,
  user_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  unique(event_id, user_id)
);

create table if not exists public.intercampus_team_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.intercampus_events(id) on delete cascade,
  created_by uuid references public.profiles(id),
  message text,
  required_skills text[],
  team_size_needed integer,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists public.intercampus_team_post_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.intercampus_team_posts(id) on delete cascade,
  user_id uuid references public.profiles(id),
  message text,
  created_at timestamptz default now()
);

create table if not exists public.intercampus_discussions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.intercampus_events(id) on delete cascade,
  title text,
  created_by uuid references public.profiles(id),
  is_locked boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.intercampus_discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid references public.intercampus_discussions(id) on delete cascade,
  user_id uuid references public.profiles(id),
  message text,
  created_at timestamptz default now()
);

create index if not exists idx_intercampus_events_verified
  on public.intercampus_events (verification_status, event_start_date desc);
create index if not exists idx_intercampus_events_fest
  on public.intercampus_events (fest_name, college_name);
create index if not exists idx_intercampus_submissions_status
  on public.intercampus_event_submissions (status, created_at desc);
create index if not exists idx_intercampus_team_posts_event
  on public.intercampus_team_posts (event_id, created_at desc);
create index if not exists idx_intercampus_discussions_event
  on public.intercampus_discussions (event_id, created_at desc);

alter table public.intercampus_events enable row level security;
alter table public.intercampus_event_submissions enable row level security;
alter table public.intercampus_interested_users enable row level security;
alter table public.intercampus_team_posts enable row level security;
alter table public.intercampus_team_post_replies enable row level security;
alter table public.intercampus_discussions enable row level security;
alter table public.intercampus_discussion_replies enable row level security;

-- Public verified events visibility
create policy if not exists "intercampus events read verified"
  on public.intercampus_events for select
  using (verification_status = 'verified');

-- Creator and faculty/admin can read all events
create policy if not exists "intercampus events elevated read"
  on public.intercampus_events for select
  using (
    auth.uid() = created_by
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('faculty', 'admin')
    )
  );

create policy if not exists "intercampus event insert faculty admin"
  on public.intercampus_events for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('faculty', 'admin')
    )
  );

create policy if not exists "intercampus event update faculty admin"
  on public.intercampus_events for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('faculty', 'admin')
    )
  );

create policy if not exists "intercampus submissions create own"
  on public.intercampus_event_submissions for insert
  with check (auth.uid() = submitted_by);

create policy if not exists "intercampus submissions read own or faculty"
  on public.intercampus_event_submissions for select
  using (
    auth.uid() = submitted_by
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('faculty', 'admin')
    )
  );

create policy if not exists "intercampus submissions faculty update"
  on public.intercampus_event_submissions for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('faculty', 'admin')
    )
  );

create policy if not exists "intercampus interested read"
  on public.intercampus_interested_users for select using (true);

create policy if not exists "intercampus interested manage own"
  on public.intercampus_interested_users for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "intercampus team posts read"
  on public.intercampus_team_posts for select using (true);

create policy if not exists "intercampus team posts create own"
  on public.intercampus_team_posts for insert
  with check (auth.uid() = created_by);

create policy if not exists "intercampus team posts update own or admin"
  on public.intercampus_team_posts for update
  using (
    auth.uid() = created_by
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('faculty', 'admin')
    )
  );

create policy if not exists "intercampus team posts delete own or admin"
  on public.intercampus_team_posts for delete
  using (
    auth.uid() = created_by
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('faculty', 'admin')
    )
  );

create policy if not exists "intercampus team replies read"
  on public.intercampus_team_post_replies for select using (true);

create policy if not exists "intercampus team replies create own"
  on public.intercampus_team_post_replies for insert
  with check (auth.uid() = user_id);

create policy if not exists "intercampus team replies delete own or admin"
  on public.intercampus_team_post_replies for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('faculty', 'admin')
    )
  );

create policy if not exists "intercampus discussions read"
  on public.intercampus_discussions for select using (true);

create policy if not exists "intercampus discussions create own"
  on public.intercampus_discussions for insert
  with check (auth.uid() = created_by);

create policy if not exists "intercampus discussions update admin"
  on public.intercampus_discussions for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('faculty', 'admin')
    )
  );

create policy if not exists "intercampus replies read"
  on public.intercampus_discussion_replies for select using (true);

create policy if not exists "intercampus replies create own"
  on public.intercampus_discussion_replies for insert
  with check (auth.uid() = user_id);

create policy if not exists "intercampus replies delete own or admin"
  on public.intercampus_discussion_replies for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('faculty', 'admin')
    )
  );
