export const DEPARTMENT_OPTIONS = [
  'Computer Science and Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Artificial Intelligence and Data Science',
  'Cyber Security',
  'Electronics and Communication Engineering',
  'Electrical and Electronics Engineering',
  'Electronics and Computer Engineering',
  'Computer Science with AI',
  'MBA',
  'MCA',
  'MTech',
  'Integrated MCA',
] as const;

export const SECTION_OPTIONS = ['A', 'B', 'C'] as const;

const DEFAULT_SINGLE_SECTION = ['A'] as const;

export const getSectionOptions = (department?: string | null): string[] => {
  const dept = String(department || '').trim().toLowerCase();
  if (
    dept === 'computer science and engineering' ||
    dept === 'computer science with ai'
  ) {
    return [...SECTION_OPTIONS] as string[];
  }
  return [...DEFAULT_SINGLE_SECTION] as string[];
};

export const getDepartmentAcademicLimits = (department?: string | null) => {
  const dept = String(department || '').trim().toLowerCase();

  if (dept === 'integrated mca') {
    return { maxYears: 5, maxSemesters: 10 };
  }

  if (dept === 'mca' || dept === 'mba' || dept === 'mtech') {
    return { maxYears: 2, maxSemesters: 4 };
  }

  return { maxYears: 4, maxSemesters: 8 };
};

export const SPECIALIZATION_BY_DEPARTMENT: Record<string, string[]> = {
  'Computer Science and Engineering': [
    'Software Engineering',
    'Cloud Computing',
    'Data Engineering',
    'Full Stack Development',
  ],
  'Mechanical Engineering': [
    'Thermal Engineering',
    'Manufacturing',
    'Mechatronics',
    'Automobile Engineering',
  ],
  'Civil Engineering': [
    'Structural Engineering',
    'Construction Management',
    'Geotechnical Engineering',
    'Transportation Engineering',
  ],
  'Artificial Intelligence and Data Science': [
    'Machine Learning',
    'Data Analytics',
    'Natural Language Processing',
    'Computer Vision',
  ],
  'Cyber Security': [
    'Network Security',
    'Ethical Hacking',
    'Digital Forensics',
    'Application Security',
  ],
  'Electrical and Electronics Engineering': [
    'Power Systems',
    'Embedded Systems',
    'Control Systems',
    'Industrial Automation',
  ],
  'Electronics and Communication Engineering': [
    'VLSI Design',
    'Signal Processing',
    'Wireless Communication',
    'IoT Systems',
  ],
  'Electronics and Computer Engineering': [
    'Embedded AI',
    'Computer Hardware Systems',
    'Robotics',
    'Edge Computing',
  ],
  'Computer Science with AI': [
    'Applied AI',
    'Intelligent Systems',
    'Deep Learning',
    'AI Product Engineering',
  ],
  MBA: [
    'Finance',
    'Marketing',
    'Human Resource Management',
    'Operations Management',
  ],
  MCA: [
    'Application Development',
    'Data Analytics',
    'Cloud and DevOps',
    'Cyber Security',
  ],
  MTech: [
    'Computer Science',
    'Embedded Systems',
    'Power Electronics',
    'Structural Engineering',
  ],
  'Integrated MCA': [
    'Software Engineering',
    'Data Science',
    'Cyber Security',
    'Cloud Computing',
  ],
};

export const getSpecializationOptions = (department?: string | null): string[] => {
  if (!department) return [];
  return SPECIALIZATION_BY_DEPARTMENT[department] ?? [];
};
