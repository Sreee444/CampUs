export type EventEligibilityInput = {
  eligibility_type?: 'college' | 'department' | 'year' | 'department_year' | string | null;
  eligible_departments?: string[] | null;
  eligible_years?: number[] | null;
};

export type UserEligibilityInput = {
  department?: string | null;
  year?: number | null;
};

export type EligibilityResult = {
  isEligible: boolean;
  reason?: string;
};

const normalizeDepartment = (value?: string | null): string => {
  if (!value) return '';
  const text = value.toLowerCase().trim();
  const compact = text.replace(/[^a-z0-9]/g, '');

  if (compact === 'cse' || compact.includes('computerscienceandengineering')) return 'cse';
  if (compact === 'it' || compact.includes('informationtechnology')) return 'it';
  if (compact === 'ece' || compact.includes('electronicsandcommunicationengineering')) return 'ece';
  if (compact === 'eee' || compact.includes('electronicsandelectricalengineering') || compact.includes('electricalandelectronicsengineering')) return 'eee';
  if (compact === 'me' || compact.includes('mechanicalengineering')) return 'me';
  if (compact === 'ce' || compact.includes('civilengineering')) return 'ce';
  if (compact === 'aids' || compact.includes('artificialintelligenceanddatascience')) return 'aids';
  if (compact === 'aiml' || compact.includes('artificialintelligenceandmachinelearning')) return 'aiml';
  if (compact === 'csai' || compact.includes('computersciencewithai')) return 'csai';
  if (compact.includes('cybersecurity')) return 'cybersecurity';

  return compact;
};

export const evaluateEventEligibility = (
  event: EventEligibilityInput,
  user: UserEligibilityInput
): EligibilityResult => {
  const type = event.eligibility_type || 'college';
  const allowedDepartments = (event.eligible_departments || []).map(normalizeDepartment).filter(Boolean);
  const allowedYears = (event.eligible_years || []).filter((y): y is number => Number.isFinite(y));
  const userDepartment = normalizeDepartment(user.department);
  const userYear = user.year ?? null;

  if (type === 'college') {
    return { isEligible: true };
  }

  if (type === 'department') {
    if (allowedDepartments.length === 0) return { isEligible: true };
    if (!userDepartment) {
      return { isEligible: false, reason: 'Complete your department in profile to register for this event.' };
    }
    if (!allowedDepartments.includes(userDepartment)) {
      return { isEligible: false, reason: 'This event is restricted to selected departments only.' };
    }
    return { isEligible: true };
  }

  if (type === 'year') {
    if (allowedYears.length === 0) return { isEligible: true };
    if (!userYear) {
      return { isEligible: false, reason: 'Complete your academic year in profile to register for this event.' };
    }
    if (!allowedYears.includes(userYear)) {
      return { isEligible: false, reason: 'This event is restricted to selected years only.' };
    }
    return { isEligible: true };
  }

  if (type === 'department_year') {
    if (!userDepartment) {
      return { isEligible: false, reason: 'Complete your department in profile to register for this event.' };
    }
    if (!userYear) {
      return { isEligible: false, reason: 'Complete your academic year in profile to register for this event.' };
    }
    const deptOk = allowedDepartments.length === 0 || allowedDepartments.includes(userDepartment);
    const yearOk = allowedYears.length === 0 || allowedYears.includes(userYear);
    if (!(deptOk && yearOk)) {
      return { isEligible: false, reason: 'This event is restricted by both department and year.' };
    }
    return { isEligible: true };
  }

  return { isEligible: true };
};

