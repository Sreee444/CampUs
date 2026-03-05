export type FeedPostType = 'announcement' | 'event' | 'exam' | 'general';
export type FeedVisibility = 'global' | 'department';

export interface FeedPost {
  id: string;
  author_id: string;
  content: string;
  images?: string[];
  type: FeedPostType;
  department?: string;
  visibility: FeedVisibility;
  is_approved: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    name: string;
    full_name?: string;
    avatar_url: string;
    role: string;
    department?: string;
  };
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: {
    id: string;
    name: string;
    full_name?: string;
    avatar_url: string;
  };
}

export interface PostLike {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}



export interface FeedFilter {
  type?: FeedPostType;
  department?: string;
  visibility?: FeedVisibility;
  searchText?: string;
}
