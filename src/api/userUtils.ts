// User utility functions for chat and profile features
// @ts-nocheck
import { supabase } from "./supabase";

/**
 * Check if a user is blocked by another user
 */
export const isUserBlockedBy = async (userId: string, potentialBlockerId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from("user_blocks")
      .select("id")
      .eq("blocking_user_id", potentialBlockerId)
      .eq("blocked_user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error checking block status:", error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error("Error in isUserBlockedBy:", error);
    return false;
  }
};

/**
 * Check if a user can be messaged (not blocked, not suspended)
 */
export const canMessageUser = async (recipientId: string, currentUserId: string): Promise<boolean> => {
  try {
    // Check if recipient is suspended
    const { data: recipient } = await supabase
      .from("profiles")
      .select("is_suspended")
      .eq("id", recipientId)
      .maybeSingle();

    if (recipient && recipient.is_suspended) {
      return false;
    }

    // Check if current user is blocked
    const isBlocked = await isUserBlockedBy(currentUserId, recipientId);
    return !isBlocked;
  } catch (error) {
    console.error("Error in canMessageUser:", error);
    return false;
  }
};

/**
 * Get user's verification badges
 */
export const getUserBadges = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from("user_verifications")
      .select("verification_type, verified_at, expires_at")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching user badges:", error);
      return [];
    }

    return data?.map((badge: any) => ({
      type: badge.verification_type,
      active: !badge.expires_at || new Date(badge.expires_at) > new Date(),
    })) || [];
  } catch (error) {
    console.error("Error in getUserBadges:", error);
    return [];
  }
};

/**
 * Get user's online status
 */
export const getUserOnlineStatus = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("status, status_updated_at, last_active")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching user status:", error);
      return { status: "offline", last_active: null };
    }

    return {
      status: data ? (data.status || "offline") : "offline",
      last_active: data?.last_active,
      updated_at: data?.status_updated_at,
    };
  } catch (error) {
    console.error("Error in getUserOnlineStatus:", error);
    return { status: "offline", last_active: null };
  }
};

/**
 * Format user status for display
 */
export const formatUserStatus = (status: string, lastActive?: string): string => {
  switch (status) {
    case "online":
      return "Online";
    case "away":
      return "Away";
    case "offline":
      if (lastActive) {
        const date = new Date(lastActive);
        const now = new Date();
        const diffMinutes = Math.round((now.getTime() - date.getTime()) / 60000);

        if (diffMinutes < 1) return "Just now";
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)}h ago`;
        return `${Math.round(diffMinutes / 1440)}d ago`;
      }
      return "Offline";
    default:
      return "Offline";
  }
};

/**
 * Get formatted mutual connections count
 */
export const getMutualConnectionsText = (count: number): string => {
  if (count === 0) return "No mutual connections";
  if (count === 1) return "1 mutual connection";
  return `${count} mutual connections`;
};

/**
 * Check if user has specific role in group
 */
export const hasGroupRole = async (
  conversationId: string,
  userId: string,
  requiredRole: "admin" | "moderator" | "member" | "viewer"
): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from("conversation_participants")
      .select("role, is_admin")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .is("left_at", null)
      .maybeSingle();

    if (error) {
      console.error("Error checking role:", error);
      return false;
    }

    if (!data) return false;

    // Handle legacy is_admin field as well as new role field
    const roleHierarchy: Record<string, number> = {
      admin: 3,
      moderator: 2,
      member: 1,
      viewer: 0,
    };

    let userRoleLevel = 0;
    const participant = data as any;
    if (participant.is_admin) {
      userRoleLevel = roleHierarchy.admin;
    } else {
      userRoleLevel = roleHierarchy[participant.role] || 0;
    }

    const requiredLevel = roleHierarchy[requiredRole];
    return userRoleLevel >= requiredLevel;
  } catch (error) {
    console.error("Error in hasGroupRole:", error);
    return false;
  }
};

/**
 * Get role-based permissions for group actions
 */
export const getGroupPermissions = async (conversationId: string, userId: string) => {
  try {
    const isAdmin = await hasGroupRole(conversationId, userId, "admin");
    const isModerator = await hasGroupRole(conversationId, userId, "moderator");

    return {
      canManageMembers: isAdmin || isModerator,
      canEditGroup: isAdmin,
      canDeleteMessages: isAdmin || isModerator,
      canCreateAnnouncement: isAdmin,
      canPinMessages: isAdmin || isModerator,
      isAdmin,
      isModerator,
    };
  } catch (error) {
    console.error("Error in getGroupPermissions:", error);
    return {
      canManageMembers: false,
      canEditGroup: false,
      canDeleteMessages: false,
      canCreateAnnouncement: false,
      canPinMessages: false,
      isAdmin: false,
      isModerator: false,
    };
  }
};
