import {
  Report,
  ReportCategory,
  ReportPriority,
  ReportStatus,
  ReportContentType,
  AdminActionType,
} from '../types/database';

/**
 * CATEGORY & TYPES HELPERS
 */

export const REPORT_CATEGORIES: { label: string; value: ReportCategory; description: string }[] = [
  {
    label: '🚨 Harassment',
    value: 'harassment',
    description: 'Unwanted contact, threats, or intimidation',
  },
  {
    label: '😤 Offensive Content',
    value: 'offensive_content',
    description: 'Rude, insulting, or disrespectful content',
  },
  {
    label: '⚠️ Misinformation',
    value: 'misinformation',
    description: 'False or misleading information',
  },
  {
    label: '📧 Spam',
    value: 'spam',
    description: 'Repetitive or unwanted messages',
  },
  {
    label: '💰 Scam/Fraud',
    value: 'scam_fraud',
    description: 'Fraudulent or deceptive activity',
  },
  {
    label: '🔥 Violence/Threats',
    value: 'violence_threats',
    description: 'Violent language or threats of harm',
  },
  {
    label: '😠 Hate Speech',
    value: 'hate_speech',
    description: 'Hateful content targeting individuals or groups',
  },
  {
    label: '🔞 Sexual Content',
    value: 'sexual_content',
    description: 'Explicit or sexual material',
  },
  {
    label: '©️ Copyright',
    value: 'copyright',
    description: 'Copyright or intellectual property violation',
  },
  {
    label: '❓ Other',
    value: 'other',
    description: 'Other reason not listed',
  },
];

export const REPORT_CONTENT_TYPES: { label: string; value: ReportContentType }[] = [
  { label: 'User Profile', value: 'user' },
  { label: 'Feed Post', value: 'feed_post' },
  { label: 'Message', value: 'message' },
  { label: 'Chat', value: 'chat' },
  { label: 'Group Chat', value: 'group_chat' },
  { label: 'Event', value: 'event' },
  { label: 'Project', value: 'project' },
  { label: 'Discussion', value: 'discussion' },
  { label: 'Comment', value: 'comment' },
  { label: 'Other', value: 'other' },
];

export const ADMIN_ACTIONS: { label: string; value: AdminActionType; severity: 'low' | 'medium' | 'high' | 'critical' }[] = [
  { label: 'Warning', value: 'warning', severity: 'low' },
  { label: 'Remove Content', value: 'remove_content', severity: 'medium' },
  { label: 'Temporary Ban', value: 'temporary_ban', severity: 'high' },
  { label: 'Permanent Ban', value: 'ban_user', severity: 'critical' },
  { label: 'Escalate', value: 'escalate', severity: 'high' },
  { label: 'Dismiss', value: 'dismiss', severity: 'low' },
  { label: 'No Action', value: 'no_action', severity: 'low' },
  { label: 'Appeal', value: 'user_appealed', severity: 'medium' },
  { label: 'Other', value: 'other', severity: 'medium' },
];

/**
 * PRIORITY HELPERS
 */

export const getPriorityColor = (priority: ReportPriority): string => {
  const colors: Record<ReportPriority, string> = {
    critical: '#DC2626', // Red
    high: '#EA580C', // Orange
    medium: '#F59E0B', // Amber
    low: '#10B981', // Green
  };
  return colors[priority];
};

export const getPriorityLabel = (priority: ReportPriority): string => {
  const labels: Record<ReportPriority, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };
  return labels[priority];
};

export const calculatePriority = (category: ReportCategory, isModerator: boolean): ReportPriority => {
  // Critical categories
  if (['violence_threats', 'scam_fraud', 'hate_speech'].includes(category)) {
    return 'critical';
  }

  // High categories
  if (['harassment', 'sexual_content'].includes(category)) {
    return 'high';
  }

  // Medium categories
  if (['offensive_content', 'misinformation', 'copyright'].includes(category)) {
    return 'medium';
  }

  return 'low';
};

/**
 * STATUS HELPERS
 */

export const getStatusColor = (status: ReportStatus): string => {
  const colors: Record<ReportStatus, string> = {
    pending: '#6B7280', // Gray
    reviewing: '#3B82F6', // Blue
    in_progress: '#8B5CF6', // Purple
    on_hold: '#A78BFA', // Purple/Violet
    resolved: '#10B981', // Green
    dismissed: '#9CA3AF', // Light Gray
    awaiting_info: '#F59E0B', // Amber
  };
  return colors[status];
};

export const getStatusLabel = (status: ReportStatus): string => {
  const labels: Record<ReportStatus, string> = {
    pending: 'Pending',
    reviewing: 'Under Review',
    in_progress: 'In Progress',
    on_hold: 'On Hold',
    resolved: 'Resolved',
    dismissed: 'Dismissed',
    awaiting_info: 'Awaiting Info',
  };
  return labels[status];
};

export const getNextPossibleStatuses = (currentStatus: ReportStatus): ReportStatus[] => {
  const transitions: Record<ReportStatus, ReportStatus[]> = {
    pending: ['reviewing', 'awaiting_info', 'dismissed', 'on_hold'],
    reviewing: ['in_progress', 'awaiting_info', 'dismissed', 'resolved', 'on_hold'],
    in_progress: ['resolved', 'awaiting_info', 'dismissed', 'on_hold'],
    on_hold: ['pending', 'reviewing', 'dismissed', 'awaiting_info'],
    resolved: [], // Terminal state
    dismissed: ['reviewing', 'pending'], // Can reopen
    awaiting_info: ['reviewing', 'dismissed', 'on_hold'],
  };
  return transitions[currentStatus];
};

/**
 * CATEGORY HELPERS
 */

export const getCategoryLabel = (category: ReportCategory): string => {
  const categoryData = REPORT_CATEGORIES.find((c) => c.value === category);
  return categoryData?.label || category;
};

export const getCategoryDescription = (category: ReportCategory): string => {
  const categoryData = REPORT_CATEGORIES.find((c) => c.value === category);
  return categoryData?.description || '';
};

/**
 * CONTENT TYPE HELPERS
 */

export const getContentTypeLabel = (type: ReportContentType): string => {
  const typeData = REPORT_CONTENT_TYPES.find((t) => t.value === type);
  return typeData?.label || type;
};

export const getContentTypeIcon = (type: ReportContentType): string => {
  const icons: Record<ReportContentType, string> = {
    user: '👤',
    feed_post: '📰',
    message: '💬',
    chat: '💭',
    group_chat: '👥',
    event: '🎪',
    project: '📁',
    discussion: '🗨️',
    comment: '💭',
    other: '❓',
  };
  return icons[type];
};

/**
 * VALIDATION HELPERS
 */

export const validateReportForm = (data: {
  title?: string;
  description?: string;
  category?: string;
  contentType?: string;
}): { isValid: boolean; errors: Record<string, string> } => {
  const errors: Record<string, string> = {};

  if (!data.title || data.title.trim().length < 5) {
    errors.title = 'Title must be at least 5 characters';
  }

  if (!data.title || data.title.length > 150) {
    errors.title = 'Title cannot exceed 150 characters';
  }

  if (!data.description || data.description.trim().length < 20) {
    errors.description = 'Description must be at least 20 characters';
  }

  if (!data.description || data.description.length > 2000) {
    errors.description = 'Description cannot exceed 2000 characters';
  }

  if (!data.category) {
    errors.category = 'Please select a category';
  }

  if (!data.contentType) {
    errors.contentType = 'Please select what you are reporting';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * FORMATTING & DISPLAY HELPERS
 */

export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return formatDate(dateString);
};

export const getResolutionTime = (report: Report): string => {
  if (!report.resolved_at) return 'Not resolved';

  const created = new Date(report.created_at).getTime();
  const resolved = new Date(report.resolved_at).getTime();
  const hours = Math.round((resolved - created) / (1000 * 60 * 60));

  if (hours < 1) return '< 1 hour';
  if (hours < 24) return `${hours} hours`;
  return `${Math.floor(hours / 24)} days`;
};

/**
 * SORTING & FILTERING
 */

export const sortReportsByPriority = (reports: Report[]): Report[] => {
  const priorityOrder: Record<ReportPriority, number> = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  };

  return [...reports].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
};

export const sortReportsByDate = (reports: Report[], ascending = false): Report[] => {
  return [...reports].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return ascending ? dateA - dateB : dateB - dateA;
  });
};

export const groupReportsByStatus = (reports: Report[]): Record<ReportStatus, Report[]> => {
  const grouped: Record<ReportStatus, Report[]> = {
    pending: [],
    reviewing: [],
    in_progress: [],
    on_hold: [],
    resolved: [],
    dismissed: [],
    awaiting_info: [],
  };

  reports.forEach((report) => {
    grouped[report.status].push(report);
  });

  return grouped;
};

export const groupReportsByCategory = (reports: Report[]): Record<ReportCategory, Report[]> => {
  const grouped: Record<string, Report[]> = {};

  reports.forEach((report) => {
    if (!grouped[report.category]) {
      grouped[report.category] = [];
    }
    grouped[report.category].push(report);
  });

  return grouped as Record<ReportCategory, Report[]>;
};

/**
 * STATISTICS HELPERS
 */

export const calculateReportStats = (reports: Report[]) => {
  return {
    total: reports.length,
    pending: reports.filter((r) => r.status === 'pending').length,
    reviewing: reports.filter((r) => r.status === 'reviewing').length,
    inProgress: reports.filter((r) => r.status === 'in_progress').length,
    resolved: reports.filter((r) => r.status === 'resolved').length,
    dismissed: reports.filter((r) => r.status === 'dismissed').length,
    critical: reports.filter((r) => r.priority === 'critical').length,
    high: reports.filter((r) => r.priority === 'high').length,
    categories: getReportCategoryCounts(reports),
    types: getReportTypeCounts(reports),
  };
};

export const getReportCategoryCounts = (reports: Report[]): Record<string, number> => {
  const counts: Record<string, number> = {};

  reports.forEach((report) => {
    counts[report.category] = (counts[report.category] || 0) + 1;
  });

  return counts;
};

export const getReportTypeCounts = (reports: Report[]): Record<string, number> => {
  const counts: Record<string, number> = {};

  reports.forEach((report) => {
    counts[report.reported_content_type] = (counts[report.reported_content_type] || 0) + 1;
  });

  return counts;
};

/**
 * BATCH OPERATION HELPERS
 */

export const filterReports = (
  reports: Report[],
  filters: {
    status?: ReportStatus[];
    category?: ReportCategory[];
    priority?: ReportPriority[];
    search?: string;
  }
): Report[] => {
  let filtered = [...reports];

  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter((r) => filters.status!.includes(r.status));
  }

  if (filters.category && filters.category.length > 0) {
    filtered = filtered.filter((r) => filters.category!.includes(r.category));
  }

  if (filters.priority && filters.priority.length > 0) {
    filtered = filtered.filter((r) => filters.priority!.includes(r.priority));
  }

  if (filters.search) {
    const search = filters.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        (r.title?.toLowerCase() || '').includes(search) ||
        (r.description?.toLowerCase() || '').includes(search) ||
        (r.category?.toLowerCase() || '').includes(search)
    );
  }

  return filtered;
};

/**
 * ACTION HELPERS
 */

export const getActionLabel = (action: AdminActionType): string => {
  const actionData = ADMIN_ACTIONS.find((a) => a.value === action);
  return actionData?.label || action;
};

export const getActionSeverity = (action: AdminActionType): 'low' | 'medium' | 'high' | 'critical' => {
  const actionData = ADMIN_ACTIONS.find((a) => a.value === action);
  return actionData?.severity || 'medium';
};

/**
 * URL & NAVIGATION HELPERS
 */

export const getReportDetailRoute = (reportId: string): string => {
  return `/admin/reports/${reportId}`;
};

export const getAdminReportsRoute = (filters?: any): string => {
  let route = '/admin/reports';

  if (filters) {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.category) params.append('category', filters.category);
    if (filters.priority) params.append('priority', filters.priority);

    if (params.toString()) {
      route += `?${params.toString()}`;
    }
  }

  return route;
};

/**
 * EXPORT HELPERS
 */

export const generateReportSummary = (report: Report): string => {
  return `
Report #${report.id}
Category: ${getCategoryLabel(report.category)}
Priority: ${getPriorityLabel(report.priority)}
Status: ${getStatusLabel(report.status)}

Title: ${report.title}
Description: ${report.description}

Content Type: ${getContentTypeLabel(report.reported_content_type)}
Created: ${formatDate(report.created_at)}
${report.resolved_at ? `Resolved: ${formatDate(report.resolved_at)}` : ''}
${report.admin_notes ? `Admin Notes: ${report.admin_notes}` : ''}
  `.trim();
};

/**
 * QUERY STRING HELPERS
 */

export const parseReportFilters = (queryString: string): any => {
  const params = new URLSearchParams(queryString);

  return {
    status: params.get('status'),
    category: params.get('category'),
    priority: params.get('priority'),
    search: params.get('search'),
    page: parseInt(params.get('page') || '1', 10),
    limit: parseInt(params.get('limit') || '20', 10),
  };
};

export const buildReportFilterQuery = (filters: any): string => {
  const params = new URLSearchParams();

  if (filters.status) params.append('status', filters.status);
  if (filters.category) params.append('category', filters.category);
  if (filters.priority) params.append('priority', filters.priority);
  if (filters.search) params.append('search', filters.search);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());

  return params.toString();
};
