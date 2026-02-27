-- CampUs Supabase Bootstrap Schema
-- Run this whole file once in Supabase SQL Editor on a fresh project.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Utilities
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Core user/profile
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  avatar_url text,
  bio text,
  role text not null default 'student' check (role in ('student','alumni','faculty','admin')),
  phone text,

  department text,
  specialization text,
  section text check (section in ('A','B','C','D')),
  year_of_admission int,
  year int,
  semester int,
  batch text,
  roll_number text,
  enrollment_number text,
  academic_status text check (academic_status in ('active','graduated')),

  is_club_coordinator boolean not null default false,
  is_volunteer boolean not null default false,
  club_name text,

  skills text[] not null default '{}',
  interests text[] not null default '{}',
  project_preferences text[] not null default '{}',

  is_mentor boolean not null default false,
  mentor_bio text,
  areas_of_expertise text[] not null default '{}',

  is_verified boolean not null default false,
  is_suspended boolean not null default false,
  status text not null default 'offline' check (status in ('online','away','offline')),
  status_updated_at timestamptz,

  notification_enabled boolean not null default true,
  chat_enabled boolean not null default true,

  last_active timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    department,
    specialization,
    section,
    year_of_admission,
    year,
    semester,
    batch,
    roll_number,
    academic_status,
    bio,
    skills,
    interests
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'student'),
    new.raw_user_meta_data ->> 'department',
    new.raw_user_meta_data ->> 'specialization',
    new.raw_user_meta_data ->> 'section',
    nullif(new.raw_user_meta_data ->> 'year_of_admission', '')::int,
    nullif(new.raw_user_meta_data ->> 'year', '')::int,
    nullif(new.raw_user_meta_data ->> 'semester', '')::int,
    new.raw_user_meta_data ->> 'batch',
    new.raw_user_meta_data ->> 'roll_number',
    new.raw_user_meta_data ->> 'academic_status',
    new.raw_user_meta_data ->> 'bio',
    coalesce((select array_agg(x::text) from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'skills', '[]'::jsonb)) x), '{}'),
    coalesce((select array_agg(x::text) from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'interests', '[]'::jsonb)) x), '{}')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Social / feed / discussion
-- -----------------------------------------------------------------------------

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (requester_id, recipient_id),
  check (requester_id <> recipient_id)
);

create trigger trg_connections_updated_at
before update on public.connections
for each row execute function public.set_updated_at();

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  type text not null default 'general' check (type in ('announcement','event','exam','notice','general')),
  images text[] not null default '{}',
  is_approved boolean not null default false,
  is_pinned boolean not null default false,
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_feed_posts_updated_at
before update on public.feed_posts
for each row execute function public.set_updated_at();

create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (post_id, user_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_post_comments_updated_at
before update on public.post_comments
for each row execute function public.set_updated_at();

create table if not exists public.discussion_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'general' check (category in ('academic','doubt','general','project')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_discussion_topics_updated_at
before update on public.discussion_topics
for each row execute function public.set_updated_at();

create table if not exists public.discussion_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.discussion_topics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_solution boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_discussion_replies_updated_at
before update on public.discussion_replies
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Events + event teams
-- -----------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text not null default 'other' check (event_type in ('workshop','seminar','hackathon','competition','fest','other')),
  start_date timestamptz not null,
  end_date timestamptz not null,
  venue text,
  is_online boolean not null default false,
  meeting_link text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  organizers text[] not null default '{}',
  banner_image text,
  max_participants int,
  registration_deadline timestamptz,

  participation_type text check (participation_type in ('individual','team')),
  min_team_size int,
  max_team_size int,
  eligibility_type text,
  eligible_departments text[] not null default '{}',
  eligible_years int[] not null default '{}',

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create table if not exists public.event_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  team_code text not null unique,
  leader_id uuid references public.profiles(id) on delete set null,
  required_roles text[] not null default '{}',
  max_members int not null default 5,
  status text not null default 'forming' check (status in ('forming','complete','locked')),
  is_looking_for_members boolean not null default true,
  is_recruiting boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_event_teams_updated_at
before update on public.event_teams
for each row execute function public.set_updated_at();

create table if not exists public.event_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.event_teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('leader','member')),
  status text not null default 'active' check (status in ('active','inactive')),
  joined_at timestamptz not null default timezone('utc', now()),
  unique (team_id, user_id)
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.event_teams(id) on delete set null,
  status text not null default 'registered' check (status in ('registered','attended','cancelled')),
  looking_for_team boolean not null default false,
  registered_at timestamptz not null default timezone('utc', now()),
  unique (event_id, user_id)
);

create table if not exists public.team_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.event_teams(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete cascade,
  type text not null check (type in ('join','invite')),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_team_requests_updated_at
before update on public.team_requests
for each row execute function public.set_updated_at();

-- Legacy screen compatibility table
create table if not exists public.team_join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.event_teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (team_id, user_id)
);

create trigger trg_team_join_requests_updated_at
before update on public.team_join_requests
for each row execute function public.set_updated_at();

create table if not exists public.event_discussions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  is_pre_event boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reminder_time timestamptz not null,
  notification_type text not null default 'push' check (notification_type in ('push','email')),
  is_sent boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

-- -----------------------------------------------------------------------------
-- Projects
-- -----------------------------------------------------------------------------

create table if not exists public.project_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text,
  required_skills text[] not null default '{}',
  max_members int not null default 5,
  is_ai_generated boolean not null default false,
  match_score numeric,
  is_recruiting boolean not null default true,
  conversation_id uuid,
  created_by uuid not null references public.profiles(id) on delete cascade,

  status text default 'planning' check (status in ('planning','recruiting','in-progress','completed','on-hold','cancelled')),
  mentor_id uuid references public.profiles(id) on delete set null,
  is_featured boolean not null default false,
  completion_percentage int,
  github_url text,
  demo_url text,
  tags text[] not null default '{}',

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_project_teams_updated_at
before update on public.project_teams
for each row execute function public.set_updated_at();

create table if not exists public.project_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.project_teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('leader','member','mentor','advisor')),
  joined_at timestamptz not null default timezone('utc', now()),
  unique (team_id, user_id)
);

create table if not exists public.project_team_join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.project_teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_project_team_join_requests_updated_at
before update on public.project_team_join_requests
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Mentoring / AI / moderation / notifications
-- -----------------------------------------------------------------------------

create table if not exists public.mentor_requests (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  mentee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','completed')),
  message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_mentor_requests_updated_at
before update on public.mentor_requests
for each row execute function public.set_updated_at();

create table if not exists public.mentorship_sessions (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  mentee_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes int not null,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text,
  body text,
  message text,
  related_id text,
  related_type text,
  action_url text,
  image_url text,
  metadata jsonb,
  data jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  suggestion_type text not null check (suggestion_type in ('collaborator','mentor','team','event')),
  suggested_user_id uuid references public.profiles(id) on delete set null,
  suggested_team_id uuid references public.event_teams(id) on delete set null,
  suggested_event_id uuid references public.events(id) on delete set null,
  match_score numeric,
  reason text,
  reasoning text,
  metadata jsonb,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','viewed')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  verified_by uuid not null references public.profiles(id) on delete cascade,
  verification_type text not null check (verification_type in ('mentor','admin','faculty','ambassador')),
  is_active boolean not null default true,
  verified_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz
);

create table if not exists public.user_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  banned_by uuid references public.profiles(id) on delete set null,
  reason text not null,
  banned_until timestamptz,
  is_permanent boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocking_user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (blocking_user_id, blocked_user_id),
  check (blocking_user_id <> blocked_user_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  reported_by uuid references public.profiles(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  reported_post_id uuid references public.feed_posts(id) on delete set null,
  reported_message_id uuid,
  reason text not null,
  description text,
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  action_taken text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  flagged_reason text,
  text text,
  created_at timestamptz not null default timezone('utc', now())
);

-- -----------------------------------------------------------------------------
-- Chat
-- -----------------------------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  group_name text,
  group_avatar text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  supervisor_id uuid references public.profiles(id) on delete set null,
  supervision_started_at timestamptz,
  supervision_ended_at timestamptz,
  is_locked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_admin boolean not null default false,
  role text default 'member' check (role in ('admin','moderator','member','viewer')),
  joined_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz,
  unique (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  message_type text not null default 'text' check (message_type in ('text','image','file','system')),
  attachment_url text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  forwarded_from_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_messages_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

create table if not exists public.message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default timezone('utc', now()),
  unique (message_id, user_id)
);

create table if not exists public.typing_indicators (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, user_id)
);

create table if not exists public.pinned_messages (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (message_id, conversation_id)
);

create table if not exists public.group_announcements (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_group_announcements_updated_at
before update on public.group_announcements
for each row execute function public.set_updated_at();

create table if not exists public.group_activity_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('joined','left','promoted','demoted','removed','group_name_changed','group_avatar_changed','admin_changed')),
  target_user_id uuid references public.profiles(id) on delete set null,
  details text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  message_type text not null default 'text' check (message_type in ('text','image','file','system')),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.content_filters (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  keyword text not null,
  action text not null check (action in ('block','warn','flag_for_review')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_content_filters_updated_at
before update on public.content_filters
for each row execute function public.set_updated_at();

create table if not exists public.connection_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  suggested_user_id uuid not null references public.profiles(id) on delete cascade,
  suggestion_type text not null check (suggestion_type in ('shared_interests','shared_events','skill_match','project_match')),
  match_score numeric not null default 0,
  common_attributes text[] not null default '{}',
  dismissed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_analytics (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  total_messages int not null default 0,
  unique_senders int not null default 0,
  most_active_member_id uuid references public.profiles(id) on delete set null,
  message_count_by_day jsonb,
  average_response_time_minutes numeric,
  last_calculated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_engagement_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  messages_sent int not null default 0,
  conversations_participated int not null default 0,
  messages_received int not null default 0,
  active_groups int not null default 0,
  last_activity timestamptz,
  engagement_score int not null default 0,
  calculated_at timestamptz not null default timezone('utc', now())
);

-- -----------------------------------------------------------------------------
-- RPC required by src/api/projects.ts
-- -----------------------------------------------------------------------------

create or replace function public.accept_team_join_request(
  p_request_id uuid,
  p_team_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_exists boolean;
  v_member_count int;
  v_max_members int;
begin
  select exists (
    select 1
    from public.project_team_join_requests r
    where r.id = p_request_id
      and r.team_id = p_team_id
      and r.user_id = p_user_id
      and r.status = 'pending'
  ) into v_request_exists;

  if not v_request_exists then
    return jsonb_build_object('success', false, 'error', 'Join request not found or already processed');
  end if;

  insert into public.project_team_members(team_id, user_id, role)
  values (p_team_id, p_user_id, 'member')
  on conflict (team_id, user_id) do nothing;

  update public.project_team_join_requests
  set status = 'accepted', updated_at = timezone('utc', now())
  where id = p_request_id;

  select count(*) into v_member_count
  from public.project_team_members
  where team_id = p_team_id;

  select max_members into v_max_members
  from public.project_teams
  where id = p_team_id;

  if v_max_members is not null and v_member_count >= v_max_members then
    update public.project_teams
    set is_recruiting = false, updated_at = timezone('utc', now())
    where id = p_team_id;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.accept_team_join_request(uuid, uuid, uuid) to authenticated;

create or replace function public.remove_team_member_secure(
  p_team_id uuid,
  p_user_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_actor_role text;
  v_target_role text;
begin
  select created_by into v_creator_id
  from public.project_teams
  where id = p_team_id;

  if v_creator_id is null then
    return jsonb_build_object('success', false, 'error', 'Team not found');
  end if;

  if p_user_id = v_creator_id then
    return jsonb_build_object('success', false, 'error', 'Project creator cannot be removed');
  end if;

  if p_actor_id <> v_creator_id then
    select role into v_actor_role
    from public.profiles
    where id = p_actor_id;

    if v_actor_role is distinct from 'admin' then
      return jsonb_build_object('success', false, 'error', 'Only creator or admin can remove members');
    end if;
  end if;

  select role into v_target_role
  from public.profiles
  where id = p_user_id;

  if v_target_role = 'admin' then
    return jsonb_build_object('success', false, 'error', 'Admin members cannot be removed');
  end if;

  delete from public.project_team_members
  where team_id = p_team_id
    and user_id = p_user_id;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.remove_team_member_secure(uuid, uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

create index if not exists idx_connections_requester on public.connections(requester_id);
create index if not exists idx_connections_recipient on public.connections(recipient_id);
create index if not exists idx_feed_posts_author on public.feed_posts(author_id);
create index if not exists idx_post_likes_post on public.post_likes(post_id);
create index if not exists idx_post_comments_post on public.post_comments(post_id);
create index if not exists idx_events_creator on public.events(created_by);
create index if not exists idx_event_registrations_event_user on public.event_registrations(event_id, user_id);
create index if not exists idx_event_registrations_team on public.event_registrations(team_id);
create index if not exists idx_event_teams_event on public.event_teams(event_id);
create index if not exists idx_event_team_members_team on public.event_team_members(team_id);
create index if not exists idx_project_team_members_team on public.project_team_members(team_id);
create index if not exists idx_project_team_join_requests_team on public.project_team_join_requests(team_id);
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at desc);
create index if not exists idx_message_reads_user on public.message_reads(user_id);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);
create index if not exists idx_team_requests_target on public.team_requests(target_user_id);
create index if not exists idx_team_requests_requester on public.team_requests(requester_id);

-- -----------------------------------------------------------------------------
-- RLS policies
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
drop policy if exists profiles_select_authenticated on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self_or_admin on public.profiles;

create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (true);

create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_self_or_admin
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

do $$
declare
  t text;
begin
  foreach t in array array[
    'connections','feed_posts','post_likes','post_comments',
    'discussion_topics','discussion_replies',
    'events','event_teams','event_team_members','event_registrations','event_discussions','event_reminders','team_requests','team_join_requests',
    'project_teams','project_team_members','project_team_join_requests',
    'mentor_requests','mentorship_sessions','notifications','ai_suggestions',
    'user_verifications','user_bans','user_blocks','reports','moderation_logs',
    'conversations','conversation_participants','messages','message_reads','typing_indicators',
    'pinned_messages','group_announcements','group_activity_logs','scheduled_messages','content_filters',
    'connection_suggestions','chat_analytics','user_engagement_metrics'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_authenticated_all on public.%I', t, t);
    execute format('create policy %I_authenticated_all on public.%I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Storage buckets + policies
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('post-images', 'post-images', true),
  ('event-banners', 'event-banners', true),
  ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

drop policy if exists "Public read avatars" on storage.objects;
drop policy if exists "Public read post-images" on storage.objects;
drop policy if exists "Public read event-banners" on storage.objects;
drop policy if exists "Public read chat-attachments" on storage.objects;

create policy "Public read avatars"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

create policy "Public read post-images"
on storage.objects
for select
to public
using (bucket_id = 'post-images');

create policy "Public read event-banners"
on storage.objects
for select
to public
using (bucket_id = 'event-banners');

create policy "Public read chat-attachments"
on storage.objects
for select
to public
using (bucket_id = 'chat-attachments');

drop policy if exists "Auth write own objects" on storage.objects;
create policy "Auth write own objects"
on storage.objects
for all
to authenticated
using (
  bucket_id in ('avatars','post-images','event-banners','chat-attachments')
  and owner = auth.uid()
)
with check (
  bucket_id in ('avatars','post-images','event-banners','chat-attachments')
  and owner = auth.uid()
);
