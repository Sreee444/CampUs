import { supabase } from './supabase';
import {
  Report,
  ReportResolution,
  ReportAuditLog,
  ReportStatistics,
  ReportStatus,
  ReportCategory,
  ReportContentType,
  AdminActionType,
  PendingReportView,
  Profile,
} from '../types/database';

/**
 * REPORT CREATION & RETRIEVAL
 */

/**
 * Create a new report
 * @param report - Report data to create
 * @returns The created report
 */
export const createReport = async (report: {
  reporter_id: string;
  reported_content_type: ReportContentType;
  category: ReportCategory;
  title: string;
  description: string;
  reported_user_id?: string;
  reported_content_id?: string;
  image_urls?: string[];
  reporter_email?: string;
  reporter_phone?: string;
  additional_info?: Record<string, any>;
}): Promise<Report> => {
  try {
    const reportsTable = supabase.from('reports') as any;

    // Avoid SELECT after INSERT; in some RLS setups selecting inserted rows touches restricted tables.
    const { error } = await reportsTable.insert([
      {
        ...report,
        reporter_email: undefined,
        reporter_phone: undefined,
      },
    ]);

    if (error) {
      // Backward-compat fallback for older/alternate report schemas.
      const fallbackDescription = [
        report.description,
        `Category: ${report.category}`,
        `Content Type: ${report.reported_content_type}`,
        report.reported_content_id ? `Content ID: ${report.reported_content_id}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const fallbackInsert = await reportsTable.insert([
        {
          reporter_id: report.reporter_id,
          reported_user_id: report.reported_user_id,
          reason: report.title,
          description: fallbackDescription,
          status: 'pending',
        },
      ]);

      if (fallbackInsert.error) throw fallbackInsert.error;
    }

    // Return a local success object since INSERT uses minimal return mode.
    const now = new Date().toISOString();
    return {
      id: `local-${Date.now()}`,
      reporter_id: report.reporter_id,
      reported_content_type: report.reported_content_type,
      reported_user_id: report.reported_user_id,
      reported_content_id: report.reported_content_id,
      category: report.category,
      title: report.title,
      description: report.description,
      priority: 'medium',
      image_urls: report.image_urls,
      additional_info: report.additional_info,
      status: 'pending',
      created_at: now,
      updated_at: now,
      is_deleted: false,
    } as Report;
  } catch (error) {
    console.error('Error creating report:', error);
    throw error;
  }
};

/**
 * Get all reports with filtering and pagination
 * @param options - Filter and pagination options
 */
export const getAllReports = async (options: {
  status?: ReportStatus;
  category?: ReportCategory;
  priority?: string;
  assigned_admin_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ reports: Report[]; total: number }> => {
  try {
    const {
      status,
      category,
      priority,
      assigned_admin_id,
      search,
      limit = 20,
      offset = 0,
    } = options;

    let query = supabase.from('reports').select('*', { count: 'exact' }).eq('is_deleted', false);

    // Apply filters
    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);
    if (priority) query = query.eq('priority', priority);
    if (assigned_admin_id) query = query.eq('assigned_admin_id', assigned_admin_id);

    // Search in title and description
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Order by priority and created_at
    query = query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      reports: data || [],
      total: count || 0,
    };
  } catch (error) {
    console.error('Error fetching reports:', error);
    throw error;
  }
};

/**
 * Get a single report by ID
 */
export const getReportById = async (reportId: string): Promise<Report> => {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .eq('is_deleted', false)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching report:', error);
    throw error;
  }
};

/**
 * Get reports by a specific reporter
 */
export const getReportsByReporter = async (
  reporterId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ reports: Report[]; total: number }> => {
  try {
    const { limit = 20, offset = 0 } = options;

    const { data, error, count } = await supabase
      .from('reports')
      .select('*', { count: 'exact' })
      .eq('reporter_id', reporterId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      reports: data || [],
      total: count || 0,
    };
  } catch (error) {
    console.error('Error fetching reporter reports:', error);
    throw error;
  }
};

/**
 * REPORT MANAGEMENT
 */

/**
 * Update report status
 */
export const updateReportStatus = async (
  reportId: string,
  status: ReportStatus,
  adminNotes?: string,
  adminId?: string
): Promise<Report> => {
  try {
    const updateData: any = { status, updated_at: new Date().toISOString() };
    if (adminNotes) updateData.admin_notes = adminNotes;
    if (adminId) updateData.assigned_admin_id = adminId;

    const reportsTable = supabase.from('reports') as any;
    const { data, error } = await reportsTable
      .update(updateData)
      .eq('id', reportId)
      .select()
      .single();

    if (error) throw error;

    // Log the action
    if (adminId) {
      await logAuditAction(reportId, 'status_changed', `Status changed to ${status}`, adminId, {
        old_status: (await getReportById(reportId)).status,
        new_status: status,
      });
    }

    return data;
  } catch (error) {
    console.error('Error updating report status:', error);
    throw error;
  }
};

/**
 * Assign report to admin
 */
export const assignReportToAdmin = async (
  reportId: string,
  adminId: string
): Promise<Report> => {
  try {
    const reportsTable = supabase.from('reports') as any;
    const { data, error } = await reportsTable
      .update({
        assigned_admin_id: adminId,
        status: 'reviewing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId)
      .select()
      .single();

    if (error) throw error;

    // Log the action
    await logAuditAction(reportId, 'assigned', `Report assigned to admin`, adminId);

    return data;
  } catch (error) {
    console.error('Error assigning report:', error);
    throw error;
  }
};

/**
 * ADD ADMIN ACTION (RESOLUTION)
 */

/**
 * Create a report resolution (admin takes action)
 */
export const resolveReport = async (
  reportId: string,
  resolution: {
    action_type: AdminActionType;
    admin_id: string;
    resolution_description: string;
    resolution_notes?: string;
    feedback_to_reporter?: string;
    action_duration_hours?: number;
  }
): Promise<ReportResolution> => {
  try {
    // Create resolution
    const resolutionsTable = supabase.from('report_resolutions') as any;
    const { data, error } = await resolutionsTable
      .insert([
        {
          report_id: reportId,
          ...resolution,
          reporter_notified: false,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Update report status to resolved
    await updateReportStatus(reportId, 'resolved', undefined, resolution.admin_id);

    // Set resolved_at timestamp
    const reportsTable = supabase.from('reports') as any;
    await reportsTable
      .update({
        resolved_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    // Log the action
    await logAuditAction(reportId, 'resolved', `Report resolved with action: ${resolution.action_type}`, resolution.admin_id, {
      action_type: resolution.action_type,
    });

    return data;
  } catch (error) {
    console.error('Error resolving report:', error);
    throw error;
  }
};

/**
 * Dismiss a report
 */
export const dismissReport = async (reportId: string, adminId: string, reason?: string): Promise<Report> => {
  try {
    const reportsTable = supabase.from('reports') as any;
    const { data, error } = await reportsTable
      .update({
        status: 'dismissed',
        admin_notes: reason,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId)
      .select()
      .single();

    if (error) throw error;

    // Log the action
    await logAuditAction(reportId, 'dismissed', `Report dismissed: ${reason || 'No reason provided'}`, adminId);

    return data;
  } catch (error) {
    console.error('Error dismissing report:', error);
    throw error;
  }
};

/**
 * Send feedback to reporter about action taken
 */
export const notifyReporterOfAction = async (
  resolutionId: string,
  feedbackMessage: string
): Promise<ReportResolution> => {
  try {
    const resolutionsTable = supabase.from('report_resolutions') as any;
    const { data, error } = await resolutionsTable
      .update({
        feedback_to_reporter: feedbackMessage,
        reporter_notified: true,
        notified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', resolutionId)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error notifying reporter:', error);
    throw error;
  }
};

/**
 * Get resolution for a report
 */
export const getReportResolution = async (reportId: string): Promise<ReportResolution | null> => {
  try {
    const { data, error } = await supabase
      .from('report_resolutions')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data || null;
  } catch (error) {
    console.error('Error fetching report resolution:', error);
    throw error;
  }
};

/**
 * AUDIT LOGGING
 */

/**
 * Log an audit action
 */
export const logAuditAction = async (
  reportId: string,
  action: string,
  description?: string,
  userId?: string,
  metadata?: Record<string, any>
): Promise<ReportAuditLog> => {
  try {
      const { data, error } = await (supabase
        .from('report_audit_logs')
        .insert([
        {
          report_id: reportId,
          action,
          description,
          user_id: userId,
          metadata: metadata || {},
        },
        ] as any) as any)
        .select()
        .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error logging audit action:', error);
    throw error;
  }
};

/**
 * Get audit logs for a report
 */
export const getReportAuditLogs = async (reportId: string): Promise<ReportAuditLog[]> => {
  try {
    const { data, error } = await supabase
      .from('report_audit_logs')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }
};

/**
 * STATISTICS & ANALYTICS
 */

/**
 * Get overall report statistics
 */
export const getReportStatistics = async (): Promise<ReportStatistics> => {
  try {
    const { data, error } = await supabase.from('report_statistics').select('*').single();

    if (error) throw error;

    return (
      data || {
        total_reports: 0,
        pending_reports: 0,
        reviewing_reports: 0,
        in_progress_reports: 0,
        resolved_reports: 0,
        dismissed_reports: 0,
        critical_reports: 0,
        high_reports: 0,
        resolution_rate: 0,
        avg_resolution_hours: 0,
      }
    );
  } catch (error) {
    console.error('Error fetching report statistics:', error);
    throw error;
  }
};

/**
 * Get category breakdown
 */
export const getCategoryBreakdown = async (): Promise<any[]> => {
  try {
    const { data, error } = await supabase.from('report_category_breakdown').select('*');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching category breakdown:', error);
    throw error;
  }
};

/**
 * Get pending reports view
 */
export const getPendingReports = async (options: {
  limit?: number;
  offset?: number;
} = {}): Promise<{ reports: PendingReportView[]; total: number }> => {
  try {
    const { limit = 20, offset = 0 } = options;

    const { data, error, count } = await supabase
      .from('pending_reports_view')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      reports: data || [],
      total: count || 0,
    };
  } catch (error) {
    console.error('Error fetching pending reports:', error);
    throw error;
  }
};

/**
 * Get report count by content type
 */
export const getReportsByContentType = async (): Promise<any[]> => {
  try {
      const query = supabase
      .from('reports')
      .select('reported_content_type, count(*)')
        .eq('is_deleted', false) as any;
      const { data, error } = await (query.group_by('reported_content_type') as any);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching reports by content type:', error);
    throw error;
  }
};

/**
 * Get report count by category
 */
export const getReportsByCategory = async (): Promise<any[]> => {
  try {
     const query = supabase.from('reports').select('category, count(*)').eq('is_deleted', false) as any;
     const { data, error } = await (query.group_by('category') as any);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching reports by category:', error);
    throw error;
  }
};

/**
 * ADMIN DASHBOARD QUERIES
 */

/**
 * Get dashboard overview data
 */
export const getDashboardOverview = async (): Promise<any> => {
  try {
    const [stats, categoryBreakdown, contentTypeStats] = await Promise.all([
      getReportStatistics(),
      getCategoryBreakdown(),
      getReportsByContentType(),
    ]);

    return {
      statistics: stats,
      categoryBreakdown,
      contentTypeStats,
    };
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    throw error;
  }
};

/**
 * Get admin's assigned reports
 */
export const getAdminAssignedReports = async (
  adminId: string,
  options: { status?: ReportStatus; limit?: number; offset?: number } = {}
): Promise<{ reports: Report[]; total: number }> => {
  try {
    const { status, limit = 20, offset = 0 } = options;

    let query = supabase
      .from('reports')
      .select('*', { count: 'exact' })
      .eq('assigned_admin_id', adminId)
      .eq('is_deleted', false);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      reports: data || [],
      total: count || 0,
    };
  } catch (error) {
    console.error('Error fetching admin reports:', error);
    throw error;
  }
};

/**
 * EXPORT & UTILITIES
 */

/**
 * Export reports to CSV format
 */
export const exportReportsToCSV = (reports: Report[]): string => {
  const headers = [
    'ID',
    'Reporter',
    'Category',
    'Priority',
    'Status',
    'Content Type',
    'Title',
    'Created At',
    'Resolved At',
  ];

  const rows = reports.map((r) => [
    r.id,
    r.reporter_email || 'Unknown',
    r.category,
    r.priority,
    r.status,
    r.reported_content_type,
    r.title,
    new Date(r.created_at).toLocaleString(),
    r.resolved_at ? new Date(r.resolved_at).toLocaleString() : 'N/A',
  ]);

  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

  return csv;
};

/**
 * Calculate average resolution time
 */
export const calculateAverageResolutionTime = (reports: Report[]): number => {
  const resolvedReports = reports.filter((r) => r.resolved_at);

  if (resolvedReports.length === 0) return 0;

  const totalTime = resolvedReports.reduce((sum, r) => {
    const created = new Date(r.created_at).getTime();
    const resolved = new Date(r.resolved_at!).getTime();
    return sum + (resolved - created);
  }, 0);

  return totalTime / resolvedReports.length / (1000 * 60 * 60); // Return in hours
};

/**
 * Soft delete a report
 */
export const softDeleteReport = async (reportId: string): Promise<Report> => {
  try {
    const reportsTable = supabase.from('reports') as any;
    const { data, error } = await reportsTable
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', reportId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error deleting report:', error);
    throw error;
  }
};
