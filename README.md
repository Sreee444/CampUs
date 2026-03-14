# CAMPUS - Complete Campus Collaboration Platform

![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react&alt=React+Native)
![Expo](https://img.shields.io/badge/Expo-~54.0-000020?logo=expo&alt=Expo)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&alt=Supabase)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&alt=TypeScript)

## 🎯 Overview

**CAMPUS** is a production-ready mobile application designed to enhance campus collaboration, academic networking, and student engagement. Built with React Native, Expo, and Supabase, it provides a comprehensive platform for students, faculty, and alumni to connect, collaborate, and learn together.

---

## ✨ Features

### 🔐 Authentication & User Management

- Email/Password authentication via Supabase
- Role-based access control (Student, Faculty, Alumni, Admin)
- User profiles with academic information
- Avatar uploads and bio customization
- Skills, interests and project preferences

### 📰 Campus Feed

- Academic announcements and notices
- Exam details and institutional events
- Like and comment functionality
- Admin/Faculty moderation
- Content categorization (announcement, exam, event, notice, general)

### 📅 Events & Activities

- Event creation and management
- Workshop, seminar, hackathon support
- Event registration system
- Calendar integration
- Pre-event and post-event discussion threads
- Automated reminders via notifications
- Banner image uploads

### 💬 Communication System

- **Academic Discussions** - Topic-based forums with categories
- **Direct Messaging** - 1-on-1 chats with connection requests
- **Group Chats** - Project team communications
- Real-time messaging with Supabase Realtime
- ✨ **Phase 1 Features:**
  - ✅ Typing indicators (see who's typing)
  - ✅ Read receipts (single/double check marks)
  - ✅ Message reactions (emoji reactions)
  - ✅ Pin messages (groups only, admin feature)
  - ✅ Copy/Forward message actions
- Typing indicators
- Read receipts
- Message deletion
- File attachments support

### 🤝 Matching & Recommendations

- AI-powered collaborator suggestions based on skills/interests
- Interest-based academic matching
- Cross-department collaboration opportunities
- Team formation recommendations

### 🧑‍🏫 Mentor-Mentee System

- Senior students and alumni as mentors
- Mentorship request system
- Scheduled mentoring sessions
- AI-based mentor recommendations
- Faculty oversight capabilities

### 🧪 Project Team Formation

- Create and join project teams
- AI-assisted team formation
- Skill-based team matching
- Dedicated team chat rooms
- Faculty visibility into teams
- Project team management

### 🤖 AI Features

- Collaborator recommendations
- Mentor matching
- Project team suggestions
- Event personalization
- Engagement prediction
- Chat moderation (group chats only)

### 🔔 Notifications

- Push notifications via Expo Notifications
- In-app alerts
- Event reminders
- Message notifications
- Connection requests
- Team invitations

### 🛡️ Admin & Faculty Panel

- User and role management
- Post moderation and approval
- Discussion moderation
- Broadcast messaging
- Report and ban system
- Engagement analytics

### 🎨 UI/UX

- Dark mode support
- Smooth animations with Reanimated
- Skeleton loaders
- Haptic feedback
- Modern, minimal design
- Responsive layouts

---

## 🛠️ Tech Stack

- **Frontend** - React Native 0.81, Expo ~54.0
- **Language** - TypeScript 5.9
- **Backend** - Supabase (PostgreSQL + Realtime + Storage)
- **State Management** - Context API + Zustand
- **Navigation** - React Navigation 6
- **UI Components** - Custom components with Expo Linear Gradient
- **Notifications** - Expo Notifications + Firebase Cloud Messaging
- **Storage** - Supabase Storage for avatars, images, attachments
- **Real-time** - Supabase Realtime for chat and notifications

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites

```bash
node --version   # Should be 18+
npm --version    # Should be 9+
expo --version   # If not installed: npm install -g expo-cli
```

### 1. Install Dependencies

```bash
cd CampUs
npm install
```

### 2. Setup Supabase Database

#### A. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create account
2. Create new project (takes ~2 minutes)
3. Copy URL and anon key from Settings → API

#### B. Fix RLS Policies (CRITICAL)

This fixes the "new row violates row-level security" error during signup.

1. Go to Supabase Dashboard → SQL Editor
2. Click "New Query"
3. Run this SQL:

```sql
-- Critical: Allow users to insert their own profile after signup
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own notifications"
ON notifications FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can create conversations"
ON conversations FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can insert events"
ON events FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can insert projects"
ON project_teams FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can insert connections"
ON connections FOR INSERT
WITH CHECK (auth.uid() = user_id OR auth.uid() = connected_user_id);

CREATE POLICY "Users can insert mentor requests"
ON mentor_requests FOR INSERT
WITH CHECK (auth.uid() = mentee_id);
```

#### C. Run the Main Database Schema

1. Go to SQL Editor → New Query
2. Copy and paste the SQL from the **Database Schema** section below
3. Click "Run" - this creates all tables, indexes, and policies

#### D. Create Storage Buckets

1. Go to Storage → Create new bucket
2. Create these 4 buckets (all public):
   - `avatars`
   - `post-images`
   - `event-banners`
   - `chat-attachments`

3. For each bucket, add these policies:

**SELECT Policy:**

```sql
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'bucket-name-here');
```

**INSERT Policy:**

```sql
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bucket-name-here' AND auth.role() = 'authenticated');
```

### 3. Configure Environment

Your `.env` file should contain:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# AES chat encryption secret (messages stored encrypted in DB)
NEXT_PUBLIC_CHAT_SECRET=campus-chat-secret-key
```

### 4. Run the App

```bash
npm start
```

Then:

- Press `a` for Android emulator
- Press `i` for iOS simulator (Mac only)
- Press `w` for web
- Scan QR code with Expo Go app on your phone

### 5. First Login

1. App opens to Login Screen
2. Click "Sign Up"
3. Enter email and password
4. Select role (Student/Faculty/Alumni/Admin)
5. Complete profile (name, department, bio, skills)
6. Click "Complete Profile"
7. You're in!

---

## 🔧 Troubleshooting Common Errors

### Error: "new row violates row-level security policy"

**Solution:** Run the RLS fix SQL from step 2B above

### Error: "You must provide notification.vapidPublicKey"

**Solution:** Already fixed in code (web guard added). If you still see it:

```bash
npm start -- --clear
```

### Error: 400/401 from Supabase

**Causes:**

- Wrong email/password
- Wrong Supabase URL/key in `.env`

**Solution:**

1. Check `.env` has correct values
2. Restart Expo: `npm start --clear`
3. Create new account instead of logging in

### Error: Metro bundler crashes

```bash
npm start -- --clear
rm -rf node_modules
npm install
```

---

## 📱 Usage Guide

### Key Workflows

#### For Students

1. **Explore Feed** - View campus announcements and posts
2. **Join Events** - Register for workshops and seminars
3. **Find Teams** - Join project teams or create your own
4. **Connect** - Send connection requests and start chatting
5. **Get Mentored** - Browse mentors and request guidance
6. **AI Suggestions** - Check recommendations for collaborators

#### For Faculty

1. **Moderate Content** - Approve/reject posts and announcements
2. **Create Events** - Organize workshops and seminars
3. **Monitor Teams** - View student project teams
4. **Broadcast** - Send announcements to all users

#### For Admins

1. **User Management** - Manage roles and permissions
2. **Content Moderation** - Review reports and ban users
3. **Analytics** - View engagement statistics
4. **System Settings** - Configure app-wide settings

---

## 🗂️ Project Structure

```text
CampUs/
├── src/
│   ├── api/                  # API layer
│   │   ├── auth.ts          # Authentication functions
│   │   ├── users.ts         # User management
│   │   ├── feed.ts          # Feed posts
│   │   ├── events.ts        # Events
│   │   ├── chat.ts          # Messaging
│   │   ├── projects.ts      # Project teams
│   │   ├── notifications.ts # Notifications
│   │   ├── ai.ts            # AI matching
│   │   └── supabase.ts      # Supabase client
│   ├── components/          # Reusable components
│   ├── contexts/            # React contexts
│   │   ├── AuthContext.tsx  # Auth state
│   │   └── ThemeContext.tsx # Theme state
│   ├── navigation/          # Navigation setup
│   ├── screens/             # All app screens
│   │   ├── Auth/           # Login, Signup, etc.
│   │   ├── Home/           # Feed, Chat, Events, etc.
│   │   ├── Projects/       # Project teams
│   │   └── Settings/       # Profile settings
│   ├── store/              # Zustand stores
│   ├── theme/              # Theme configuration
│   └── types/              # TypeScript types
│       └── database.ts     # Database type definitions
├── assets/                 # Images, fonts, etc.
├── .env                    # Environment variables
├── App.tsx                 # Root component
├── package.json            # Dependencies
└── tsconfig.json           # TypeScript config
```

---

## 🚀 Building for Production

### Android APK/AAB

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Configure
eas build:configure

# Build APK for testing
eas build --platform android --profile preview

# Build AAB for Play Store
eas build --platform android --profile production
```

### iOS (requires Mac + Apple Developer Account)

```bash
# Build for App Store
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios
```

### Web Build

```bash
expo export:web
# Static files will be in web-build/
# Deploy to Vercel, Netlify, or any static host
```

---

## ✅ Pre-Launch Checklist

### Database Setup (CRITICAL)

- [ ] Create Supabase project
- [ ] Copy URL and anon key to `.env`
- [ ] Run RLS fix SQL
- [ ] Run full database schema
- [ ] Verify all tables created
- [ ] Create 4 storage buckets (avatars, post-images, event-banners, chat-attachments)
- [ ] Apply storage policies

### Code Configuration

- [ ] `.env` file exists with correct values
- [ ] Variables start with `EXPO_PUBLIC_`
- [ ] File is in `.gitignore`
- [ ] Dependencies installed without errors

### Testing Workflow

**Authentication:**

- [ ] Sign up with new email
- [ ] Profile created successfully (no RLS error)
- [ ] Can select role
- [ ] Complete profile works
- [ ] Login works
- [ ] Logout works
- [ ] Reset password email sent

**Profile Features:**

- [ ] Edit profile saves data
- [ ] Avatar upload works
- [ ] Academic details save
- [ ] Skills & interests save
- [ ] Change password works

**Main Features:**

- [ ] Feed screen loads
- [ ] Can create post
- [ ] Like/comment works
- [ ] Events screen loads
- [ ] Can create/register for event
- [ ] Chat list shows
- [ ] Can start conversation
- [ ] Messages send/receive
- [ ] AI assistant responds
- [ ] Projects screen loads
- [ ] Can create/join team

### Platform Testing

**Android:**

```bash
npm run android
```

- [ ] App builds successfully
- [ ] No crashes on launch
- [ ] All features work
- [ ] Push notifications work
- [ ] Camera/gallery permissions work

**iOS:**

```bash
npm run ios
```

- [ ] App builds successfully
- [ ] No crashes on launch
- [ ] All features work
- [ ] Push notifications work
- [ ] Camera/gallery permissions work

**Web:**

```bash
npm run web
```

- [ ] App loads in browser
- [ ] Navigation works
- [ ] No push notification errors
- [ ] Responsive layout

### Security Review

- [ ] Passwords hashed (Supabase does this)
- [ ] Email validation works
- [ ] RLS enabled on all tables
- [ ] No public write access
- [ ] User can only modify own data
- [ ] `.env` not committed to git
- [ ] Using anon key (not service role key)

### Performance Check

- [ ] App launches in <3 seconds
- [ ] Screens render quickly
- [ ] No UI lag/jank
- [ ] Images load progressively
- [ ] Lists scroll smoothly
- [ ] Queries return in <1 second

### Final Verification

- [ ] Database backups enabled
- [ ] Monitoring set up
- [ ] Privacy policy published
- [ ] Terms of service published

---

## 🔒 Security & Privacy

- **Row Level Security (RLS)** - All database tables protected with RLS policies
- **Authentication** - Secure token-based auth via Supabase
- **Image Storage** - Secure file uploads with user-specific folders
- **Content Moderation** - Admin/Faculty approval system
- **Privacy Controls** - User control over chat and notifications

---

## 📊 Performance Tips

### Optimize Images

```bash
# Install image optimizer
npm install -g sharp-cli

# Optimize avatar before upload
sharp input.jpg -o output.jpg --resize 500 --quality 80
```

### Database Optimization

- Indexes already added for common queries
- Use `.select('id,name')` instead of `.select('*')`
- Paginate large lists (limit + offset)
- Enable Supabase caching

### App Performance

- Enable Hermes engine (already configured)
- Use `memo()` for expensive components
- Lazy load images with placeholder
- Cache API responses when appropriate

---

## 🗄️ Database Schema

### Overview

The complete database includes 20+ tables for:

- User profiles and authentication
- Campus feed with posts, likes, comments
- Events with registration and discussions
- Real-time chat (1-on-1 and groups)
- Project teams and collaboration
- Mentor-mentee system
- Notifications and alerts
- AI suggestions and matching
- Content moderation and reports

### SQL Schema

Run this SQL in your Supabase SQL Editor:

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE
-- ============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  role TEXT CHECK (role IN ('student', 'alumni', 'faculty', 'admin')) DEFAULT 'student',
  phone TEXT,
  
  -- Academic Info
  department TEXT,
  year INTEGER,
  enrollment_number TEXT,
  
  -- Student specific
  is_club_coordinator BOOLEAN DEFAULT false,
  is_volunteer BOOLEAN DEFAULT false,
  club_name TEXT,
  
  -- Skills & Interests
  skills TEXT[],
  interests TEXT[],
  project_preferences TEXT[],
  
  -- Mentor fields
  is_mentor BOOLEAN DEFAULT false,
  mentor_bio TEXT,
  areas_of_expertise TEXT[],
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  
  -- Settings
  notification_enabled BOOLEAN DEFAULT true,
  chat_enabled BOOLEAN DEFAULT true
);

-- ============================================
-- FEED POSTS
-- ============================================

CREATE TABLE feed_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  post_type TEXT CHECK (post_type IN ('announcement', 'exam', 'event', 'notice', 'general')) DEFAULT 'general',
  images TEXT[],
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE post_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE post_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EVENTS
-- ============================================

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT CHECK (event_type IN ('workshop', 'seminar', 'hackathon', 'competition', 'fest', 'other')) DEFAULT 'other',
  banner_url TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  location TEXT,
  max_participants INTEGER,
  current_participants INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE TABLE event_discussions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_pre_event BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CHAT/MESSAGING
-- ============================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT CHECK (type IN ('direct', 'group', 'academic')) DEFAULT 'direct',
  name TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  is_admin BOOLEAN DEFAULT false,
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  attachments TEXT[],
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE message_reads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE TABLE typing_indicators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_typing BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

-- ============================================
-- CONNECTIONS (Friend System)
-- ============================================

CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  connected_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, connected_user_id)
);

-- ============================================
-- PROJECT TEAMS
-- ============================================

CREATE TABLE project_teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  required_skills TEXT[],
  max_members INTEGER DEFAULT 5,
  current_members INTEGER DEFAULT 1,
  created_by UUID REFERENCES profiles(id),
  conversation_id UUID REFERENCES conversations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE project_team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES project_teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- ============================================
-- MENTOR-MENTEE SYSTEM
-- ============================================

CREATE TABLE mentor_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mentee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  mentor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mentee_id, mentor_id)
);

CREATE TABLE mentorship_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mentor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  mentee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration INTEGER DEFAULT 60,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI SUGGESTIONS
-- ============================================

CREATE TABLE ai_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  suggestion_type TEXT CHECK (suggestion_type IN ('collaborator', 'mentor', 'team', 'event')) NOT NULL,
  suggested_id UUID,
  score NUMERIC(3,2),
  reason TEXT,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MODERATION
-- ============================================

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reported_content_id UUID,
  content_type TEXT,
  reason TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'reviewed', 'resolved')) DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_bans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  banned_by UUID REFERENCES profiles(id),
  reason TEXT NOT NULL,
  banned_until TIMESTAMPTZ,
  is_permanent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_feed_posts_user_id ON feed_posts(user_id);
CREATE INDEX idx_feed_posts_created_at ON feed_posts(created_at DESC);
CREATE INDEX idx_events_start_time ON events(start_time);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE USING (auth.uid() = id);

-- Feed posts policies
CREATE POLICY "Approved posts are viewable by everyone"
ON feed_posts FOR SELECT USING (is_approved = true);

CREATE POLICY "Users can create posts"
ON feed_posts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
ON feed_posts FOR UPDATE USING (auth.uid() = user_id);

-- Post likes policies
CREATE POLICY "Post likes are viewable by everyone"
ON post_likes FOR SELECT USING (true);

CREATE POLICY "Users can like posts"
ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike posts"
ON post_likes FOR DELETE USING (auth.uid() = user_id);

-- Messages policies
CREATE POLICY "Users can view messages in their conversations"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = messages.conversation_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can send messages"
ON messages FOR INSERT
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = messages.conversation_id
    AND user_id = auth.uid()
  )
);

-- Notifications policies
CREATE POLICY "Users can view own notifications"
ON notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feed_posts_updated_at
BEFORE UPDATE ON feed_posts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update conversation last_message_at on new message
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_on_message
AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();
```

---

## 🎨 Customization

### Theme Colors

Edit `src/theme/colors.ts`:

```typescript
export const lightColors = {
  primary: '#6366f1',
  secondary: '#ec4899',
  // ... more colors
};
```

### Add New Features

1. Create API function in `src/api/`
2. Add screen in `src/screens/`
3. Update navigation in `src/navigation/RootNavigator.tsx`
4. Add route types in `src/navigation/types.ts`

---

## 🐛 Common Issues & Fixes

| Issue | Solution |
| ------- | ---------- |
| RLS error on signup | Run RLS fix SQL from Quick Start section |
| 401 errors | Check `.env` and restart with `npm start --clear` |
| Push notification error (web) | Already fixed in code |
| Images not uploading | Check storage buckets created |
| Real-time not working | Verify Supabase Realtime enabled |
| Build fails | Clear cache: `npm start --clear` |
| App crashes on launch | Check console, verify dependencies |

---

## 📞 Support Resources

- **Expo Docs** - <https://docs.expo.dev>
- **Supabase Docs** - <https://supabase.com/docs>
- **React Navigation** - <https://reactnavigation.org/docs>
- **Stack Overflow** - Tag with `react-native`, `expo`, `supabase`

---

## 🤝 Contributing

This is a production-ready app. For contributions:

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push and create a Pull Request

---

## 📄 License

This project is proprietary. All rights reserved.

---

## 🙏 Acknowledgments

- Expo team for the amazing framework
- Supabase for backend infrastructure
- React Native community

---

Built with ❤️ for Campus Collaboration
