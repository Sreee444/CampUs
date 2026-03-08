// Database Types for CAMPUS App

export type UserRole = 'student' | 'alumni' | 'faculty' | 'admin' | 'developer';

export type FacultyDesignation = 'hod' | 'professor' | 'assistant_professor' | 'lab_instructor';

export type UserStatus = 'online' | 'away' | 'offline';

export type Profile = {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  role: UserRole;
  phone?: string;

  // Academic Info
  department?: string;
  faculty_designation?: FacultyDesignation;
  specialization?: string;
  section?: 'A' | 'B' | 'C' | 'D';
  year_of_admission?: number;
  year?: number;
  semester?: number;
  batch?: string;
  roll_number?: string;
  academic_status?: 'active' | 'graduated';
  enrollment_number?: string;

  // Student specific
  is_club_coordinator?: boolean;
  is_volunteer?: boolean;
  club_name?: string;

  // Skills & Interests
  skills?: string[];
  interests?: string[];
  project_preferences?: string[];

  // Mentor fields
  is_mentor?: boolean;
  mentor_bio?: string;
  areas_of_expertise?: string[];

  // User Status & Verification
  is_verified?: boolean;
  is_suspended?: boolean;
  status?: UserStatus;
  status_updated_at?: string;

  // Metadata
  created_at?: string;
  updated_at?: string;
  last_active?: string;

  // Settings
  notification_enabled?: boolean;
  chat_enabled?: boolean;
};

export type PostType = 'announcement' | 'event' | 'exam' | 'notice' | 'general';

export type FeedPost = {
  id: string;
  author_id: string;
  content: string;
  type: PostType;
  images?: string[];
  is_approved: boolean;
  is_pinned: boolean;
  moderated_by?: string;
  moderated_at?: string;
  created_at: string;
  updated_at: string;

  // Joined data
  author?: Profile;
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
};

export type PostLike = {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
};

export type PostComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;

  // Joined
  user?: Profile;
};

export type EventType = 'workshop' | 'seminar' | 'hackathon' | 'competition' | 'fest' | 'other';

export type Event = {
  id: string;
  title: string;
  description?: string;
  event_type: EventType;
  start_date: string;
  end_date: string;
  venue?: string;
  is_online: boolean;
  meeting_link?: string;
  created_by: string;
  organizers?: string[];
  banner_image?: string;
  max_participants?: number;
  registration_deadline?: string;
  created_at: string;
  updated_at: string;

  // Team participation fields
  participation_type?: 'individual' | 'team';
  min_team_size?: number;
  max_team_size?: number;
  eligibility_type?: string;
  eligible_departments?: string[];
  eligible_years?: number[];

  // Joined
  creator?: Profile;
  registrations_count?: number;
  is_registered?: boolean;
};

export type EventRegistration = {
  id: string;
  event_id: string;
  user_id: string;
  registered_at: string;
  status: 'registered' | 'attended' | 'cancelled';
  team_id?: string | null;
  looking_for_team?: boolean;
};

export type EventDiscussion = {
  id: string;
  event_id: string;
  user_id: string;
  message: string;
  is_pre_event: boolean;
  created_at: string;

  // Joined
  user?: Profile;
};

export type DiscussionCategory = 'academic' | 'doubt' | 'general' | 'project';

export type DiscussionTopic = {
  id: string;
  title: string;
  description?: string;
  category: DiscussionCategory;
  created_by: string;
  discussion_scope?: 'general' | 'event';
  event_id?: string | null;
  event_phase?: 'pre' | 'post' | null;
  is_pinned: boolean;
  is_locked: boolean;
  created_at: string;
  updated_at: string;

  // Joined
  creator?: Profile;
  replies_count?: number;
  last_reply_at?: string;
};

export type DiscussionReply = {
  id: string;
  topic_id: string;
  user_id: string;
  content: string;
  is_solution: boolean;
  created_at: string;
  updated_at: string;

  // Joined
  user?: Profile;
};

export type ConnectionStatus = 'pending' | 'accepted' | 'rejected';

export type Connection = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;

  // Joined
  requester?: Profile;
  recipient?: Profile;
};

export interface ConnectionWithProfile extends Connection {
  profile?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
    role?: string;
    department?: string;
    bio?: string;
  };
}

export type Conversation = {
  id: string;
  is_group: boolean;
  group_name?: string;
  group_avatar?: string;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Faculty Supervision
  supervisor_id?: string;
  supervision_started_at?: string;
  supervision_ended_at?: string;
  is_locked?: boolean;

  // Joined
  participants?: Profile[];
  supervisor?: Profile;
  last_message?: Message;
  unread_count?: number;
};

export type ConversationParticipantRole = 'admin' | 'moderator' | 'member' | 'viewer';

export type ConversationParticipant = {
  id: string;
  conversation_id: string;
  user_id: string;
  is_admin: boolean;
  role?: ConversationParticipantRole;
  joined_at: string;
  left_at?: string;
  
  // Joined
  user?: Profile;
};

export type MessageType = 'text' | 'image' | 'file' | 'system';

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content?: string;
  message_type: MessageType;
  attachment_url?: string;
  is_deleted: boolean;
  deleted_at?: string;
  
  // Quote/Reply
  reply_to_message_id?: string;
  reply_to_message?: Message;
  
  // Forwarding
  forwarded_from_message_id?: string;
  forwarded_from_message?: Message;
  
  created_at: string;
  updated_at: string;

  // Joined
  sender?: Profile;
  is_read?: boolean;
  seen_by_others?: boolean;
};

export type MessageRead = {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
};

export type TypingIndicator = {
  conversation_id: string;
  user_id: string;
  started_at: string;
};

// Phase 1 Features
export type MessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;

  // Joined
  user?: Profile;
};

export type PinnedMessage = {
  id: string;
  message_id: string;
  conversation_id: string;
  pinned_by: string;
  created_at: string;

  // Joined
  message?: Message;
  pinned_by_user?: Profile;
};

export type MentorRequestStatus = 'pending' | 'accepted' | 'rejected' | 'completed';

export type MentorRequest = {
  id: string;
  mentor_id: string;
  mentee_id: string;
  status: MentorRequestStatus;
  message?: string;
  created_at: string;
  updated_at: string;

  // Joined
  mentor?: Profile;
  mentee?: Profile;
};

export type MentorshipSession = {
  id: string;
  mentor_id: string;
  mentee_id: string;
  scheduled_at: string;
  duration_minutes: number;
  notes?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  created_at: string;

  // Joined
  mentor?: Profile;
  mentee?: Profile;
};

export type ProjectTeam = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  required_skills?: string[];
  max_members: number;
  is_ai_generated: boolean;
  match_score?: number;
  is_recruiting: boolean;
  conversation_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;

  // New role-based fields
  status?: 'planning' | 'recruiting' | 'in-progress' | 'completed' | 'on-hold' | 'cancelleeted' | 'on-hold' | 'cancelled';
  mentor_id?: string;
  is_featured?: boolean;
  completion_percentage?: number;
  github_url?: string;
  demo_url?: string;
  tags?: string[];

  // Joined
  creator?: Profile;
  members?: Profile[];
  members_count?: number;
  mentor?: Profile;
  is_member?: boolean;
};

export type ProjectTeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  role: 'leader' | 'member' | 'mentor' | 'advisor';
  joined_at: string;

  // Joined
  user?: Profile;
};

// Event Team Types (for team-based event participation)
export type EventTeam = {
  id: string;
  name: string;
  event_id: string;
  team_code: string;
  leader_id?: string;
  required_roles?: string[];
  max_members: number;
  status?: 'forming' | 'complete' | 'locked';
  is_looking_for_members?: boolean;
  is_recruiting?: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;

  // Joined
  members?: Profile[];
  members_count?: number;
  leader?: Profile;
};

export type EventTeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  role: 'leader' | 'member';
  joined_at?: string;

  // Joined
  user?: Profile;
};

export type TeamJoinRequest = {
  id: string;
  team_id: string;
  event_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  request_count?: number;
  created_at?: string;
  updated_at?: string;

  // Joined
  user?: Profile;
  team?: EventTeam;
};

export type SuggestionType = 'collaborator' | 'mentor' | 'team' | 'event';

export type AISuggestion = {
  id: string;
  user_id: string;
  suggestion_type: SuggestionType;
  suggested_user_id?: string;
  suggested_team_id?: string;
  suggested_event_id?: string;
  match_score?: number;
  reasoning?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'viewed';
  created_at: string;

  // Joined
  suggested_user?: Profile;
  suggested_team?: ProjectTeam;
  suggested_event?: Event;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  related_id?: string;
  related_type?: string;
  action_url?: string;
  image_url?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
};

export type Report = {
  id: string;
  reported_by: string;
  reported_user_id?: string;
  reported_post_id?: string;
  reported_message_id?: string;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  reviewed_by?: string;
  reviewed_at?: string;
  action_taken?: string;
  created_at: string;
};

export type UserBan = {
  id: string;
  user_id: string;
  banned_by: string;
  reason: string;
  is_permanent?: boolean;
  banned_until?: string;
  ban_until?: string;
  created_at: string;
};

export type UserEngagement = {
  id: string;
  user_id: string;
  activity_type: string;
  activity_date: string;
  activity_count: number;
};

export type UserReminder = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  reminder_date: string;
  is_completed: boolean;
  related_event_id?: string;
  created_at: string;
};
// ===== NEW FEATURE TYPES =====

// Group Announcements (special pinned messages admins create)
export type GroupAnnouncement = {
  id: string;
  conversation_id: string;
  created_by: string;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Joined
  creator?: Profile;
};

// Scheduled Messages
export type ScheduledMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  scheduled_for: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string;
  created_at: string;

  // Joined
  sender?: Profile;
};

// Content Filters (spam/keyword blocking)
export type ContentFilter = {
  id: string;
  created_by: string; // Admin
  keyword: string;
  action: 'block' | 'warn' | 'flag_for_review';
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// User Blocks
export type UserBlock = {
  id: string;
  blocking_user_id: string;
  blocked_user_id: string;
  reason?: string;
  created_at: string;

  // Joined
  blocked_user?: Profile;
};

// Group Activity Logs (who did what)
export type GroupActivityLog = {
  id: string;
  conversation_id: string;
  actor_id: string;
  action: 'joined' | 'left' | 'promoted' | 'demoted' | 'removed' | 'group_name_changed' | 'group_avatar_changed' | 'admin_changed';
  target_user_id?: string;
  details?: string;
  created_at: string;

  // Joined
  actor?: Profile;
  target_user?: Profile;
};

// Chat Analytics
export type ChatAnalytics = {
  id: string;
  conversation_id: string;
  total_messages: number;
  unique_senders: number;
  most_active_member_id?: string;
  message_count_by_day?: Record<string, number>;
  average_response_time_minutes?: number;
  last_calculated_at: string;

  // Joined
  most_active_member?: Profile;
};

// User Engagement Metrics (for admin dashboard)
export type UserEngagementMetrics = {
  id: string;
  user_id: string;
  messages_sent: number;
  conversations_participated: number;
  messages_received: number;
  active_groups: number;
  last_activity: string;
  engagement_score: number;
  calculated_at: string;

  // Joined
  user?: Profile;
};

// Mutual Connections Helper (for profile cards)
export type MutualConnection = {
  user_id: string;
  mutual_count: number;
  common_groups?: string[];
};

// User Verification Record
export type UserVerification = {
  id: string;
  user_id: string;
  verified_by: string; // Admin
  verification_type: 'mentor' | 'admin' | 'faculty' | 'ambassador';
  is_active: boolean;
  verified_at: string;
  expires_at?: string;

  // Joined
  user?: Profile;
  verified_by_user?: Profile;
};

// Connection Suggestion
export type ConnectionSuggestion = {
  id: string;
  user_id: string;
  suggested_user_id: string;
  suggestion_type: 'shared_interests' | 'shared_events' | 'skill_match' | 'project_match';
  match_score: number;
  common_attributes?: string[];
  dismissed: boolean;
  created_at: string;

  // Joined
  suggested_user?: Profile;
};

// Unread Message Count (denormalized for performance)
export type ConversationUnreadCount = {
  user_id: string;
  conversation_id: string;
  unread_count: number;
  last_unread_at: string;
};

// --- Structured Mentorship System ---

export type MentorRole = 'alumni' | 'faculty' | 'senior';
export type MentorshipPurpose = 'career' | 'academic' | 'skill' | 'project' | 'startup';
export type MentorshipStatus = 'pending' | 'accepted' | 'rejected' | 'closed';

export type Mentor = {
  id: string;
  user_id: string;
  role: MentorRole;
  expertise_tags: string[];
  department?: string;
  company?: string;
  available: boolean;
  max_mentees: number;
  created_at: string;
  profile?: Profile;
};

export type StructuredMentorshipRequest = {
  id: string;
  mentor_id: string;
  mentee_id: string;
  purpose: MentorshipPurpose;
  project_id?: string;
  description: string;
  status: MentorshipStatus;
  created_at: string;
  updated_at: string;
  mentor?: Mentor & { profile?: Profile };
  mentee?: Profile;
};
