// Database Types for CAMPUS App

export type UserRole = 'student' | 'alumni' | 'faculty' | 'admin';

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
  year?: number;
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
  category: DiscussionCategory;
  created_by: string;
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
  user_id: string;
  connected_user_id: string;
  status: ConnectionStatus;
  requested_by: string;
  created_at: string;
  updated_at: string;
  
  // Joined
  connected_user?: Profile;
};

export type Conversation = {
  id: string;
  is_group: boolean;
  group_name?: string;
  group_avatar?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  
  // Joined
  participants?: Profile[];
  last_message?: Message;
  unread_count?: number;
};

export type ConversationParticipant = {
  id: string;
  conversation_id: string;
  user_id: string;
  is_admin: boolean;
  joined_at: string;
  left_at?: string;
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
  created_at: string;
  updated_at: string;
  
  // Joined
  sender?: Profile;
  is_read?: boolean;
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
  
  // Joined
  creator?: Profile;
  members?: Profile[];
  members_count?: number;
};

export type ProjectTeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  joined_at: string;
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
