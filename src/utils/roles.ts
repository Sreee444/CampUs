import { UserRole, FacultyDesignation } from '../types/database';

export const FACULTY_DESIGNATIONS: FacultyDesignation[] = [
  'principal',
  'vice_principal',
  'hod',
  'professor',
  'assistant_professor',
  'lab_instructor',
];

export const ADMIN_DESIGNATIONS: FacultyDesignation[] = ['principal', 'vice_principal', 'hod'];

export const FACULTY_ONLY_DESIGNATIONS: FacultyDesignation[] = [
  'professor',
  'assistant_professor',
  'lab_instructor',
];

export const getDesignationOptionsByRole = (role?: string | null): FacultyDesignation[] => {
  if (role === 'admin') return ADMIN_DESIGNATIONS;
  if (role === 'faculty') return FACULTY_ONLY_DESIGNATIONS;
  return FACULTY_DESIGNATIONS;
};

export const isLeadershipDesignation = (designation?: FacultyDesignation | string | null): boolean =>
  designation === 'principal' || designation === 'vice_principal';

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

export const getRoleDisplayLabel = (
  role?: UserRole | string | null,
  designation?: FacultyDesignation | string | null,
): string => {
  const base = formatRoleLabel(role);
  const formattedDesignation = formatFacultyDesignation(designation);
  return formattedDesignation ? `${formattedDesignation} (${base})` : base;
};

export const formatFacultyDesignation = (designation?: FacultyDesignation | string | null): string => {
  if (!designation) return '';
  if (designation === 'principal') return 'Principal';
  if (designation === 'vice_principal') return 'Vice Principal';
  if (designation === 'hod') return 'HOD';
  return designation
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const canCreateMentorProjects = (role?: UserRole | string | null): boolean =>
  role === 'faculty' || role === 'alumni' || role === 'developer';
