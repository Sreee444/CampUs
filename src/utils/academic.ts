export type AcademicStatus = 'active' | 'graduated';

export type AcademicComputedFields = {
  semester: number | null;
  year: number | null;
  batch: string | null;
  academic_status: AcademicStatus;
};

export const ROLL_NUMBER_REGEX = /^[A-Za-z0-9/-]{4,20}$/;

export const calculateAcademicFields = (
  yearOfAdmission?: number | null,
  now: Date = new Date()
): AcademicComputedFields => {
  if (!yearOfAdmission || !Number.isFinite(yearOfAdmission)) {
    return {
      semester: null,
      year: null,
      batch: null,
      academic_status: 'active',
    };
  }

  const currentYear = now.getFullYear();
  const month = now.getMonth() + 1;

  // Academic year starts in July:
  // Jul-Dec => odd semester, Jan-Jun => even semester
  let semester = (currentYear - yearOfAdmission) * 2 + (month >= 7 ? 1 : 0);

  if (semester < 1) semester = 1;
  if (semester > 8) semester = 8;

  const year = Math.max(1, Math.min(4, Math.ceil(semester / 2)));
  const academicStatus: AcademicStatus = semester >= 8 ? 'graduated' : 'active';

  return {
    semester,
    year,
    batch: `${yearOfAdmission}-${yearOfAdmission + 4}`,
    academic_status: academicStatus,
  };
};

