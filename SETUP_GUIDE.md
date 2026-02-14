# CampUs - Complete Database Setup Guide

## 🚀 One-Time Database Setup

### Step 1: Run the Database Setup Script

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Copy and paste **ALL contents** of `database_setup.sql`
5. Click **Run** or press `Ctrl+Enter`
6. Wait for completion (should see success messages)

**File Location:** `database_setup.sql` (in project root)

### Step 2: Verify Setup

After running the script, verify everything is set up:

#### Check Tables
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see: `profiles`, `feed_posts`, `events`, `project_teams`, `messages`, `notifications`, etc.

#### Check Storage Bucket
1. Go to **Storage** in Supabase Dashboard
2. You should see `avatars` bucket (Public, 5MB limit)

#### Check RLS Policies
```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename;
```

---

## 🎯 What Gets Created

### Tables
- ✅ `profiles` - User profiles with roles (student/faculty/alumni/admin)
- ✅ `feed_posts` - Social feed posts
- ✅ `post_likes` & `post_comments` - Social interactions
- ✅ `events` & `event_registrations` - Campus events
- ✅ `project_teams` & `project_team_members` - Collaborative projects
- ✅ `conversations` & `messages` - Chat system
- ✅ `notifications` - Push notifications

### Storage
- ✅ `avatars` bucket - Public, 5MB limit, JPG/PNG/WebP/GIF

### Security
- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Policies for read/write access
- ✅ Auth trigger for automatic profile creation

---

## 🧪 Testing the Setup

### Test 1: Sign Up
1. Run your app: `npm start`
2. Create a new account
3. Profile should auto-create in database

### Test 2: Avatar Upload
1. Go to Profile → Edit Profile
2. Upload an avatar
3. Should work without errors!

### Test 3: Check Database
```sql
-- View all users
SELECT id, email, full_name, role, created_at 
FROM profiles 
ORDER BY created_at DESC;
```

---

## 🛠️ Troubleshooting

### Error: "Bucket not found"
- ✅ **Solution**: Re-run the database setup script

### Error: "Permission denied"
- ✅ **Solution**: Check that RLS policies were created (run verification query above)

### Error: "Relation does not exist"
- ✅ **Solution**: Table wasn't created - re-run the database setup script

### Tables already exist?
- ✅ **Don't worry!** The script uses `IF NOT EXISTS` - it won't duplicate anything
- ✅ It will only create missing tables and update policies

---

## 📝 Database Schema Overview

```
profiles (users)
  ├── id (UUID, primary)
  ├── email, full_name, avatar_url
  ├── role (student/faculty/alumni/admin)
  ├── department, year
  ├── skills, interests (arrays)
  └── created_at, updated_at

feed_posts (social feed)
  ├── id, author_id → profiles
  ├── content, type, images
  └── is_approved, is_pinned

events (campus events)
  ├── id, title, description
  ├── event_type, start_date, end_date
  ├── venue, is_online, meeting_link
  └── created_by → profiles

project_teams (collaborations)
  ├── id, name, description
  ├── category, required_skills
  ├── status, completion_percentage
  └── created_by → profiles

messages (chat)
  ├── id, conversation_id
  ├── sender_id → profiles
  ├── content, message_type
  └── created_at
```

---

## ✅ Quick Verification Checklist

- [ ] SQL script executed successfully
- [ ] Tables visible in Supabase Table Editor
- [ ] `avatars` bucket visible in Storage
- [ ] RLS policies created (run verification query)
- [ ] Test signup works
- [ ] Test avatar upload works

---

## 🔄 Need to Reset?

If you need to start fresh:

```sql
-- ⚠️ WARNING: This will delete ALL data!
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversation_participants CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS project_team_members CASCADE;
DROP TABLE IF EXISTS project_teams CASCADE;
DROP TABLE IF EXISTS event_registrations CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS post_comments CASCADE;
DROP TABLE IF EXISTS post_likes CASCADE;
DROP TABLE IF EXISTS feed_posts CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Then re-run database_setup.sql
```

---

**Need Help?** Check the error messages in the app - they include setup instructions!

