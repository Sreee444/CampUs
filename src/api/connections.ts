// ================================================
// PHASE 2: CONNECTIONS API LAYER
// ================================================
// Production-ready API for user connection management
// Handles connection requests, status checks, and relationship queries
// Phase 7: Includes notification support for connection events
// ================================================

import { supabase } from "./supabase";
import { createNotification } from "./notifications";

// ================================================
// TYPE DEFINITIONS
// ================================================

export type ConnectionStatus = 'pending' | 'accepted' | 'rejected';

export interface Connection {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
}

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

export interface ConnectionStatusResult {
  status: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'rejected';
  connectionId?: string;
  connection?: Connection;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ================================================
// HELPER FUNCTIONS
// ================================================

/**
 * Get the current authenticated user's ID
 */
const getCurrentUserId = async (): Promise<string> => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('User not authenticated');
  }
  return user.id;
};

/**
 * Check if a connection exists between two users (in either direction)
 */
const findExistingConnection = async (
  userId1: string,
  userId2: string
): Promise<Connection | null> => {
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .or(
      `and(requester_id.eq.${userId1},recipient_id.eq.${userId2}),and(requester_id.eq.${userId2},recipient_id.eq.${userId1})`
    )
    .maybeSingle();

  if (error) throw error;
  return data;
};

// ================================================
// CORE API FUNCTIONS
// ================================================

/**
 * Send a connection request to another user
 * 
 * @param userId - The ID of the user to send a connection request to
 * @returns ApiResponse with the created connection
 * 
 * Validations:
 * - Prevents self-connection
 * - Prevents duplicate requests
 * - Prevents reverse duplicate requests
 */
export const sendConnectionRequest = async (
  userId: string
): Promise<ApiResponse<Connection>> => {
  try {
    const currentUserId = await getCurrentUserId();

    // Prevent self-connection
    if (currentUserId === userId) {
      return {
        success: false,
        error: 'Cannot send connection request to yourself'
      };
    }

    // Check for existing connection (in either direction)
    const existingConnection = await findExistingConnection(currentUserId, userId);

    if (existingConnection) {
      // Determine the relationship direction
      const isSender = existingConnection.requester_id === currentUserId;
      const statusMessage = 
        existingConnection.status === 'pending'
          ? isSender 
            ? 'You already have a pending request to this user'
            : 'This user has already sent you a connection request'
          : existingConnection.status === 'accepted'
          ? 'You are already connected with this user'
          : 'A connection request was previously rejected';

      return {
        success: false,
        error: statusMessage
      };
    }

    // Create new connection request
    const { data, error } = await supabase
      .from('connections')
      // @ts-ignore - Supabase type inference issue
      .insert({
        requester_id: currentUserId,
        recipient_id: userId,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    // Create notification for recipient (Phase 7)
    try {
      // Get current user's profile for notification
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', currentUserId)
        .single();

      const senderName = (senderProfile as any)?.full_name || 'Someone';
      
      // @ts-ignore - Notification type extension
      await createNotification({
        user_id: userId,
        type: 'connection_request',
        title: 'New Connection Request',
        body: `${senderName} sent you a connection request`,
      });
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
      // Don't fail the request if notification fails
    }

    return {
      success: true,
      data: data as Connection
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to send connection request'
    };
  }
};

/**
 * Cancel a connection request (only for pending requests sent by current user)
 * 
 * @param userId - The ID of the user to cancel the request to
 * @returns ApiResponse with success status
 */
export const cancelConnectionRequest = async (
  userId: string
): Promise<ApiResponse<void>> => {
  try {
    const currentUserId = await getCurrentUserId();

    // Find the pending request sent by current user
    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('requester_id', currentUserId)
      .eq('recipient_id', userId)
      .eq('status', 'pending');

    if (error) throw error;

    return {
      success: true
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to cancel connection request'
    };
  }
};

/**
 * Accept a connection request
 * 
 * @param connectionId - The ID of the connection to accept
 * @returns ApiResponse with updated connection
 */
export const acceptConnectionRequest = async (
  connectionId: string
): Promise<ApiResponse<Connection>> => {
  try {
    const currentUserId = await getCurrentUserId();

    // Update the connection status to accepted
    // RLS policy ensures only the recipient can do this
    const { data, error } = await supabase
      .from('connections')
      // @ts-ignore - Supabase type inference issue
      .update({ status: 'accepted' })
      .eq('id', connectionId)
      .eq('recipient_id', currentUserId)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return {
        success: false,
        error: 'Connection request not found or already processed'
      };
    }

    // Create notification for requester (Phase 7)
    try {
      // Get current user's profile for notification
      const { data: acceptorProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', currentUserId)
        .single();

      const acceptorName = (acceptorProfile as any)?.full_name || 'Someone';
      const connection = data as Connection;
      
      // @ts-ignore - Notification type extension
      await createNotification({
        user_id: connection.requester_id,
        type: 'connection_accepted',
        title: 'Connection Request Accepted',
        body: `${acceptorName} accepted your connection request`,
      });
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
      // Don't fail the acceptance if notification fails
    }

    return {
      success: true,
      data: data as Connection
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to accept connection request'
    };
  }
};

/**
 * Reject a connection request
 * 
 * @param connectionId - The ID of the connection to reject
 * @returns ApiResponse with updated connection
 */
export const rejectConnectionRequest = async (
  connectionId: string
): Promise<ApiResponse<Connection>> => {
  try {
    const currentUserId = await getCurrentUserId();

    // Update the connection status to rejected
    const { data, error } = await supabase
      .from('connections')
      // @ts-ignore - Supabase type inference issue
      .update({ status: 'rejected' })
      .eq('id', connectionId)
      .eq('recipient_id', currentUserId)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return {
        success: false,
        error: 'Connection request not found or already processed'
      };
    }

    return {
      success: true,
      data: data as Connection
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to reject connection request'
    };
  }
};

/**
 * Remove an existing connection (unfriend)
 * Can be used by either user in an accepted connection
 * 
 * @param connectionId - The ID of the connection to remove
 * @returns ApiResponse with success status
 */
export const removeConnection = async (
  connectionId: string
): Promise<ApiResponse<void>> => {
  try {
    const currentUserId = await getCurrentUserId();

    // Delete the connection (RLS ensures user is part of the connection)
    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('id', connectionId)
      .or(`requester_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`);

    if (error) throw error;

    return {
      success: true
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to remove connection'
    };
  }
};

/**
 * Get the connection status with a specific user
 * 
 * @param userId - The ID of the user to check connection status with
 * @returns ConnectionStatusResult with status and connection details
 */
export const getConnectionStatus = async (
  userId: string
): Promise<ConnectionStatusResult> => {
  try {
    const currentUserId = await getCurrentUserId();

    // Self-check
    if (currentUserId === userId) {
      return { status: 'none' };
    }

    // Find existing connection
    const connection = await findExistingConnection(currentUserId, userId);

    if (!connection) {
      return { status: 'none' };
    }

    // Determine the status based on user's perspective
    const isSender = connection.requester_id === currentUserId;

    if (connection.status === 'accepted') {
      return {
        status: 'accepted',
        connectionId: connection.id,
        connection
      };
    }

    if (connection.status === 'pending') {
      return {
        status: isSender ? 'pending_sent' : 'pending_received',
        connectionId: connection.id,
        connection
      };
    }

    if (connection.status === 'rejected') {
      return {
        status: 'rejected',
        connectionId: connection.id,
        connection
      };
    }

    return { status: 'none' };
  } catch (error: any) {
    console.error('Error getting connection status:', error);
    return { status: 'none' };
  }
};

/**
 * Get all connections for the current user
 * 
 * @param status - Optional filter by connection status
 * @returns Array of connections with profile information
 */
export const getMyConnections = async (
  status?: ConnectionStatus
): Promise<ConnectionWithProfile[]> => {
  try {
    const currentUserId = await getCurrentUserId();

    // Build query
    let query = supabase
      .from('connections')
      .select(`
        *,
        requester:profiles!connections_requester_id_fkey(
          id,
          full_name,
          avatar_url,
          role,
          department,
          bio
        ),
        recipient:profiles!connections_recipient_id_fkey(
          id,
          full_name,
          avatar_url,
          role,
          department,
          bio
        )
      `)
      .or(`requester_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
      .order('created_at', { ascending: false });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Map the data to include the connected user's profile
    const connections: ConnectionWithProfile[] = (data || []).map((conn: any) => {
      const isRequester = conn.requester_id === currentUserId;
      const profile = isRequester ? conn.recipient : conn.requester;

      return {
        id: conn.id,
        requester_id: conn.requester_id,
        recipient_id: conn.recipient_id,
        status: conn.status,
        created_at: conn.created_at,
        updated_at: conn.updated_at,
        profile
      };
    });

    return connections;
  } catch (error: any) {
    console.error('Error fetching connections:', error);
    return [];
  }
};

/**
 * Get pending connection requests received by the current user
 * 
 * @returns Array of pending requests with requester profile
 */
export const getPendingReceivedRequests = async (): Promise<ConnectionWithProfile[]> => {
  try {
    const currentUserId = await getCurrentUserId();

    const { data, error } = await supabase
      .from('connections')
      .select(`
        *,
        requester:profiles!connections_requester_id_fkey(
          id,
          full_name,
          avatar_url,
          role,
          department,
          bio
        )
      `)
      .eq('recipient_id', currentUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((conn: any) => ({
      ...conn,
      profile: conn.requester
    }));
  } catch (error: any) {
    console.error('Error fetching pending requests:', error);
    return [];
  }
};

/**
 * Get pending connection requests sent by the current user
 * 
 * @returns Array of pending sent requests with recipient profile
 */
export const getPendingSentRequests = async (): Promise<ConnectionWithProfile[]> => {
  try {
    const currentUserId = await getCurrentUserId();

    const { data, error } = await supabase
      .from('connections')
      .select(`
        *,
        recipient:profiles!connections_recipient_id_fkey(
          id,
          full_name,
          avatar_url,
          role,
          department,
          bio
        )
      `)
      .eq('requester_id', currentUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((conn: any) => ({
      ...conn,
      profile: conn.recipient
    }));
  } catch (error: any) {
    console.error('Error fetching sent requests:', error);
    return [];
  }
};

/**
 * Get count of pending connection requests received
 * 
 * @returns Number of pending requests
 */
export const getPendingRequestsCount = async (): Promise<number> => {
  try {
    const currentUserId = await getCurrentUserId();

    const { count, error } = await supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', currentUserId)
      .eq('status', 'pending');

    if (error) throw error;

    return count || 0;
  } catch (error: any) {
    console.error('Error fetching pending requests count:', error);
    return 0;
  }
};

/**
 * Get accepted connections count
 * 
 * @returns Number of accepted connections
 */
export const getConnectionsCount = async (): Promise<number> => {
  try {
    const currentUserId = await getCurrentUserId();

    const { count, error } = await supabase
      .from('connections')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`);

    if (error) throw error;

    return count || 0;
  } catch (error: any) {
    console.error('Error fetching connections count:', error);
    return 0;
  }
};

/**
 * Check if two users are connected (accepted connection)
 * 
 * @param userId - The ID of the user to check
 * @returns Boolean indicating if users are connected
 */
export const areUsersConnected = async (userId: string): Promise<boolean> => {
  const status = await getConnectionStatus(userId);
  return status.status === 'accepted';
};
