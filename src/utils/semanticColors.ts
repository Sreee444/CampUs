/**
 * Semantic Color System for CampUs
 * Premium SaaS-level color logic utilities
 */

// Core Semantic Colors
export const SEMANTIC_COLORS = {
  // Success states
  success: '#10B981',
  successLight: '#D1FAE5',
  
  // Warning states
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  
  // Danger states
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  
  // Info/Planning states
  info: '#3B82F6',
  infoLight: '#DBEAFE',
  
  // Completed states
  completed: '#8B5CF6',
  completedLight: '#EDE9FE',
  
  // Draft/Inactive states
  draft: '#94A3B8',
  draftLight: '#F1F5F9',
  
  // Primary accent (minimal usage)
  primary: '#13ecec',
  primaryLight: '#E0F7FA',
  
  // Neutral
  neutral: '#6B7280',
  neutralLight: '#F3F4F6',
  
  // Text
  textPrimary: '#111827',
  textSecondary: '#64748B',
  
  // Backgrounds
  cardBg: '#FFFFFF',
  appBg: '#F8FAFC',
};

/**
 * Get registration count color based on fill percentage
 */
export function getRegistrationColor(count: number, max: number | null): {
  color: string;
  bg: string;
  label: string;
} {
  if (count === 0) {
    return {
      color: SEMANTIC_COLORS.neutral,
      bg: SEMANTIC_COLORS.neutralLight,
      label: 'No registrations yet',
    };
  }
  
  if (!max) {
    return {
      color: SEMANTIC_COLORS.success,
      bg: SEMANTIC_COLORS.successLight,
      label: `${count} registered`,
    };
  }
  
  const percentage = (count / max) * 100;
  
  if (count >= max) {
    return {
      color: SEMANTIC_COLORS.danger,
      bg: SEMANTIC_COLORS.dangerLight,
      label: 'Full',
    };
  }
  
  if (percentage >= 70) {
    return {
      color: SEMANTIC_COLORS.warning,
      bg: SEMANTIC_COLORS.warningLight,
      label: 'Almost full',
    };
  }
  
  return {
    color: SEMANTIC_COLORS.success,
    bg: SEMANTIC_COLORS.successLight,
    label: 'Available',
  };
}

/**
 * Get team fill progress color based on percentage
 */
export function getTeamFillColor(percentage: number): string {
  if (percentage === 0) {
    return SEMANTIC_COLORS.draft;    // gray
  }
  if (percentage >= 100) {
    return '#dc2626';                // red — full
  }
  if (percentage >= 75) {
    return '#ea580c';                // orange — high warning
  }
  if (percentage >= 50) {
    return '#f59e0b';                // amber — warning
  }
  if (percentage >= 25) {
    return '#0ea5e9';                // sky — moderate
  }
  return '#3b82f6';                  // blue — low fill
}

/**
 * Get project status color
 */
export function getProjectStatusColor(status: string): {
  color: string;
  bg: string;
  icon: string;
} {
  switch (status.toLowerCase()) {
    case 'draft':
      return {
        color: SEMANTIC_COLORS.draft,
        bg: SEMANTIC_COLORS.draftLight,
        icon: 'edit',
      };
    case 'planning':
      return {
        color: '#6366f1',
        bg: '#e0e7ff',
        icon: 'lightbulb-outline',
      };
    case 'recruiting':
      return {
        color: '#0ea5e9',
        bg: '#e0f2fe',
        icon: 'group-add',
      };
    case 'in-progress':
    case 'in progress':
    case 'executing':
      return {
        color: '#f59e0b',
        bg: '#fef3c7',
        icon: 'play-circle-outline',
      };
    case 'completed':
      return {
        color: '#10b981',
        bg: '#d1fae5',
        icon: 'check-circle',
      };
    case 'on-hold':
      return {
        color: '#ef4444',
        bg: '#fee2e2',
        icon: 'pause-circle-outline',
      };
    case 'cancelled':
    case 'canceled':
      return {
        color: '#6b7280',
        bg: '#f3f4f6',
        icon: 'cancel',
      };
    case 'closed':
      return {
        color: SEMANTIC_COLORS.neutral,
        bg: SEMANTIC_COLORS.neutralLight,
        icon: 'block',
      };
    default:
      return {
        color: SEMANTIC_COLORS.neutral,
        bg: SEMANTIC_COLORS.neutralLight,
        icon: 'info',
      };
  }
}

/**
 * Get event status color
 */
export function getEventStatusColor(startDate: string, endDate: string): {
  color: string;
  bg: string;
  label: string;
  icon: string;
} {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (now < start) {
    return {
      color: SEMANTIC_COLORS.info,
      bg: SEMANTIC_COLORS.infoLight,
      label: 'Upcoming',
      icon: 'calendar-today',
    };
  }
  
  if (now >= start && now <= end) {
    return {
      color: SEMANTIC_COLORS.success,
      bg: SEMANTIC_COLORS.successLight,
      label: 'Live Now',
      icon: 'circle',
    };
  }
  
  return {
    color: SEMANTIC_COLORS.neutral,
    bg: SEMANTIC_COLORS.neutralLight,
    label: 'Ended',
    icon: 'history',
  };
}

/**
 * Get registration button state
 */
export function getRegistrationButtonState(
  registrationDeadline: string,
  isRegistered: boolean,
  isFull: boolean
): {
  color: string;
  bg: string;
  label: string;
  icon: string;
  disabled: boolean;
} {
  const now = new Date();
  const deadline = new Date(registrationDeadline);
  
  if (deadline < now) {
    return {
      color: '#FFFFFF',
      bg: '#dc2626',
      label: 'Registration Closed',
      icon: 'block',
      disabled: true,
    };
  }
  
  if (isFull && !isRegistered) {
    return {
      color: '#FFFFFF',
      bg: SEMANTIC_COLORS.neutral,
      label: 'Event Full',
      icon: 'people',
      disabled: true,
    };
  }
  
  if (isRegistered) {
    return {
      color: SEMANTIC_COLORS.success,
      bg: SEMANTIC_COLORS.successLight,
      label: 'Registered',
      icon: 'check-circle',
      disabled: false,
    };
  }
  
  return {
    color: '#FFFFFF',
    bg: SEMANTIC_COLORS.success,
    label: 'Register Now',
    icon: 'how-to-reg',
    disabled: false,
  };
}

/**
 * PROJECT STATUS OPTIONS FOR LEADER CONTROL
 * Extended statuses with semantic colors
 */
export const PROJECT_STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning', icon: 'lightbulb-outline' },
  { value: 'recruiting', label: 'Recruiting', icon: 'group-add' },
  { value: 'in-progress', label: 'Executing', icon: 'play-circle-outline' },
  { value: 'completed', label: 'Completed', icon: 'check-circle' },
  { value: 'on-hold', label: 'On Hold', icon: 'pause-circle-outline' },
  { value: 'cancelled', label: 'Cancelled', icon: 'cancel' },
];
