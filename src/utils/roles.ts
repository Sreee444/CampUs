import { UserRole, FacultyDesignation } from '../types/database';

export const FACULTY_DESIGNATIONS: FacultyDesignation[] = [
  'hod',
  'professor',
  'assistant_professor',
  'lab_instructor',
];

export const isDeveloper = (role?: string | null): boolean => role === 'developer';

export const isAdminRole = (role?: string | null): boolean => role === 'admin' || role === 'developer';

export const isFacultyRole = (role?: string | null): boolean => role === 'faculty';

export const isFacultyOrAdminRole = (role?: string | null): boolean =>
  isFacultyRole(role) || isAdminRole(role);

export const canManageEverything = (role?: string | null): boolean => isDeveloper(role);

export const canModerateAcademic = (role?: string | null): boolean =>
  isFacultyRole(role) || isAdminRole(role);

export const formatRoleLabel = (role?: string | null): string => {
  if (!role) return 'User';
  if (role === 'developer') return 'Developer';
  return role.charAt(0).toUpperCase() + role.slice(1);
};

export const formatFacultyDesignation = (designation?: FacultyDesignation | string | null): string => {
  if (!designation) return '';
  if (designation === 'hod') return 'HOD';
  return designation
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const canCreateMentorProjects = (role?: UserRole | string | null): boolean =>
  role === 'faculty' || role === 'alumni' || role === 'developer';
