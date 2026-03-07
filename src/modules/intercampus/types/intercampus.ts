export type InterCampusParticipationType = 'individual' | 'team';
export type InterCampusVerificationStatus = 'pending' | 'verified' | 'rejected';
export type InterCampusSubmissionStatus = 'pending' | 'approved' | 'rejected';
export type InterCampusSourceType = 'manual' | 'link' | 'poster' | 'fest_import' | 'ai_generated';
export type InterCampusStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';

export type InterCampusProfileMini = {
  id: string;
  full_name?: string | null;
};

export type InterCampusFest = {
  id: string;
  fest_name: string;
  fest_year?: number | null;
  college_name: string;
  college_location?: string | null;
  college_website?: string | null;
  fest_start_date?: string | null;
  fest_end_date?: string | null;
  banner_image?: string | null;
  poster_image?: string | null;
  description?: string | null;
  source_type?: InterCampusSourceType | null;
  source_url?: string | null;
  ai_generated?: boolean | null;
  verification_status?: InterCampusVerificationStatus | null;
  status?: InterCampusStatus | null;
  created_by?: string | null;
  faculty_notes?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  submitted_by_name?: string | null;
  verified_by_name?: string | null;
  submitter?: InterCampusProfileMini | null;
  verifier?: InterCampusProfileMini | null;
  created_at?: string | null;
  updated_at?: string | null;
  event_count?: number; // For joined queries
};

export type InterCampusEvent = {
  id: string;
  title: string;
  description?: string | null;
  fest_id?: string | null;
  is_fest?: boolean | null;
  parent_fest_id?: string | null;
  fest_year?: number | null;
  college_name: string;
  college_location?: string | null;
  college_website?: string | null;
  fest_name?: string | null;
  event_start_date?: string | null;
  event_end_date?: string | null;
  event_type?: string | null;
  participation_type?: InterCampusParticipationType | null;
  min_team_size?: number | null;
  max_team_size?: number | null;
  venue?: string | null;
  is_online?: boolean | null;
  registration_link?: string | null;
  registration_deadline?: string | null;
  eligibility_text?: string | null;
  banner_image?: string | null;
  faculty_notes?: string | null;
  participation_cap?: number | null;
  verification_status?: InterCampusVerificationStatus | null;
  status?: InterCampusStatus | null;
  created_by?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  submitted_by_name?: string | null;
  verified_by_name?: string | null;
  submitter?: InterCampusProfileMini | null;
  verifier?: InterCampusProfileMini | null;
  created_at?: string | null;
  source_type?: InterCampusSourceType | null;
  source_url?: string | null;
  poster_image?: string | null;
  ai_generated?: boolean | null;
  interested_count?: number;
  is_interested?: boolean;
  fest?: InterCampusFest | null; // For joined queries
};

export type InterCampusEventSubmission = {
  id: string;
  submitted_by: string;
  event_title?: string | null;
  event_description?: string | null;
  fest_id?: string | null;
  is_fest?: boolean | null;
  college_name?: string | null;
  college_location?: string | null;
  college_website?: string | null;
  fest_name?: string | null;
  event_start_date?: string | null;
  event_end_date?: string | null;
  registration_link?: string | null;
  registration_deadline?: string | null;
  fest_year?: number | null;
  participation_type?: string | null;
  min_team_size?: number | null;
  max_team_size?: number | null;
  source_type?: InterCampusSourceType | null;
  source_url?: string | null;
  poster_image?: string | null;
  ai_generated?: boolean | null;
  faculty_notes?: string | null;
  approved_event_id?: string | null;
  status: InterCampusSubmissionStatus;
  created_at?: string;
};

export type InterCampusEventMedia = {
  id: string;
  event_id: string;
  media_url: string;
  media_type: 'banner' | 'poster' | 'gallery' | 'other';
  created_by?: string | null;
  created_at?: string | null;
};

export type InterCampusTeamPost = {
  id: string;
  event_id: string;
  created_by: string;
  message?: string | null;
  required_skills?: string[] | null;
  team_size_needed?: number | null;
  status: 'open' | 'closed' | string;
  created_at?: string | null;
  creator?: {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    department?: string | null;
    role?: string | null;
  };
};

export type InterCampusTeamPostReply = {
  id: string;
  post_id: string;
  user_id: string;
  message?: string | null;
  created_at?: string | null;
  user?: {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    department?: string | null;
    role?: string | null;
  };
};

export type InterCampusDiscussion = {
  id: string;
  event_id: string;
  title?: string | null;
  created_by: string;
  is_locked: boolean;
  created_at?: string | null;
  creator?: {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    role?: string | null;
  };
};

export type InterCampusDiscussionReply = {
  id: string;
  discussion_id: string;
  user_id: string;
  message?: string | null;
  created_at?: string | null;
  user?: {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    role?: string | null;
  };
};

export type InterCampusFestGroup = {
  fest_name: string;
  college_name: string;
  college_location?: string | null;
  banner_image?: string | null;
  events: InterCampusEvent[];
};

export type InterCampusSubmissionInput = {
  event_title: string;
  event_description?: string;
  college_name: string;
  college_location?: string;
  college_website?: string;
  fest_name?: string;
  event_start_date?: string;
  event_end_date?: string;
  fest_year?: number;
  registration_link?: string;
  registration_deadline?: string;
  participation_type?: InterCampusParticipationType;
  min_team_size?: number;
  max_team_size?: number;
  source_type?: InterCampusSourceType;
  source_url?: string;
  poster_image?: string;
  ai_generated?: boolean;
};

export type InterCampusApprovePayload = {
  submission_id: string;
  faculty_notes?: string;
  participation_cap?: number;
};
