# CampUs Chat Setup Guide (1:1 + Group)

This guide matches the current implementation in:
- `src/api/chat.ts`
- `src/screens/Home/ChatListScreen.tsx`
- `src/screens/Home/ChatConversationScreen.tsx`

## 1) Database schema (Supabase SQL Editor)

Run this in Supabase SQL Editor.

```sql
-- Extensions
create extension if not exists "uuid-ossp";

-- Conversations
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  is_group boolean not null default false,
  group_name text,
  group_avatar text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  supervisor_id uuid references public.profiles(id) on delete set null,
  supervision_started_at timestamptz,
  supervision_ended_at timestamptz,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Conversation participants
create table if not exists public.conversation_participants (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_admin boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (conversation_id, user_id)
);

-- Messages
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  message_type text not null default 'text',
  attachment_url text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_type_check check (message_type in ('text','image','file','system'))
);

-- Message read receipts
create table if not exists public.message_reads (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (message_id, user_id)
);

-- Typing indicators
create table if not exists public.typing_indicators (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- Connections (required by new-chat flow)
create table if not exists public.connections (
  id uuid primary key default uuid_generate_v4(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connections_status_check check (status in ('pending','accepted','rejected')),
  constraint connections_no_self_check check (requester_id <> recipient_id)
);

-- Helpful indexes
create index if not exists idx_conversation_participants_user
  on public.conversation_participants(user_id)
  where left_at is null;

create index if not exists idx_messages_conversation_created
  on public.messages(conversation_id, created_at desc)
  where is_deleted = false;

create index if not exists idx_connections_requester_recipient
  on public.connections(requester_id, recipient_id);
```

## 2) Updated-at + conversation activity triggers

```sql
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- drop/recreate to avoid duplicates

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
before update on public.conversations
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_messages_updated_at on public.messages;
create trigger trg_messages_updated_at
before update on public.messages
for each row execute function public.update_updated_at_column();

create or replace function public.bump_conversation_on_message()
returns trigger as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bump_conversation_on_message on public.messages;
create trigger trg_bump_conversation_on_message
after insert on public.messages
for each row execute function public.bump_conversation_on_message();
```

## 3) RLS policies (required)

```sql
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.typing_indicators enable row level security;
alter table public.connections enable row level security;

-- Conversations
drop policy if exists conversations_select_participants on public.conversations;
create policy conversations_select_participants
on public.conversations for select
using (
  exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = conversations.id
      and cp.user_id = auth.uid()
      and cp.left_at is null
  )
);

drop policy if exists conversations_insert_creator on public.conversations;
create policy conversations_insert_creator
on public.conversations for insert
with check (created_by = auth.uid());

drop policy if exists conversations_update_participants on public.conversations;
create policy conversations_update_participants
on public.conversations for update
using (
  exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = conversations.id
      and cp.user_id = auth.uid()
      and cp.left_at is null
  )
)
with check (
  exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = conversations.id
      and cp.user_id = auth.uid()
      and cp.left_at is null
  )
);

-- Conversation participants
drop policy if exists participants_select_own_conversations on public.conversation_participants;
create policy participants_select_own_conversations
on public.conversation_participants for select
using (
  exists (
    select 1
    from public.conversation_participants cp2
    where cp2.conversation_id = conversation_participants.conversation_id
      and cp2.user_id = auth.uid()
      and cp2.left_at is null
  )
);

drop policy if exists participants_insert_if_member_or_creator on public.conversation_participants;
create policy participants_insert_if_member_or_creator
on public.conversation_participants for insert
with check (
  auth.uid() = user_id
  or exists (
    select 1
    from public.conversations c
    where c.id = conversation_participants.conversation_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists participants_update_self on public.conversation_participants;
create policy participants_update_self
on public.conversation_participants for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Messages
drop policy if exists messages_select_participants on public.messages;
create policy messages_select_participants
on public.messages for select
using (
  exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = auth.uid()
      and cp.left_at is null
  )
);

drop policy if exists messages_insert_sender_member on public.messages;
create policy messages_insert_sender_member
on public.messages for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = auth.uid()
      and cp.left_at is null
  )
);

drop policy if exists messages_update_sender_only on public.messages;
create policy messages_update_sender_only
on public.messages for update
using (sender_id = auth.uid())
with check (sender_id = auth.uid());

-- Message reads
drop policy if exists reads_select_own on public.message_reads;
create policy reads_select_own
on public.message_reads for select
using (user_id = auth.uid());

drop policy if exists reads_insert_own on public.message_reads;
create policy reads_insert_own
on public.message_reads for insert
with check (user_id = auth.uid());

-- Typing indicators
drop policy if exists typing_select_participants on public.typing_indicators;
create policy typing_select_participants
on public.typing_indicators for select
using (
  exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = typing_indicators.conversation_id
      and cp.user_id = auth.uid()
      and cp.left_at is null
  )
);

drop policy if exists typing_upsert_own on public.typing_indicators;
create policy typing_upsert_own
on public.typing_indicators for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Connections
drop policy if exists connections_select_involved on public.connections;
create policy connections_select_involved
on public.connections for select
using (auth.uid() = requester_id or auth.uid() = recipient_id);

drop policy if exists connections_insert_requester on public.connections;
create policy connections_insert_requester
on public.connections for insert
with check (auth.uid() = requester_id);

drop policy if exists connections_update_involved on public.connections;
create policy connections_update_involved
on public.connections for update
using (auth.uid() = requester_id or auth.uid() = recipient_id)
with check (auth.uid() = requester_id or auth.uid() = recipient_id);
```

## 4) Realtime setup

In Supabase Dashboard:
1. Open Database → Replication.
2. Enable realtime for tables:
   - `messages`
   - `typing_indicators`
3. Save.

Your app already subscribes in `src/api/chat.ts` through `subscribeToMessages` and `subscribeToTyping`.

## 5) Storage for attachments

In Supabase Dashboard:
1. Create bucket: `chat-attachments`.
2. Set bucket to public (or keep private and sign URLs in API).
3. Add storage policy to allow authenticated uploads to `chat-attachments/<userId>/...`.

## 6) App behavior now (after this update)

### 1:1 chat
- Open Chat tab → compose icon.
- Select a connection.
- App creates/fetches existing direct conversation.
- Sends/receives messages in realtime.

### Group chat
- Open Chat tab → compose icon.
- Tap **Create Group**.
- Enter group name.
- Select at least 2 connections.
- Tap **Create Group (N)**.
- App creates conversation with all members and opens chat.

### Conversation screen
- Group chats now show sender name above incoming messages.
- Conversation read state is marked when chat opens and when new messages arrive.
- Duplicate realtime inserts are deduplicated.

## 7) Quick validation checklist

- [ ] Two users can create and use direct chat
- [ ] Existing direct chat is reused (not duplicated)
- [ ] Group creation requires name + 2 selected members
- [ ] Group messages display sender name
- [ ] New messages appear in realtime without duplicates
- [ ] Unread badge drops after opening conversation
- [ ] Unauthorized user cannot read/write non-member conversation data
