export const DEPARTMENT_OPTIONS = [
  'Computer Science and Engineering',
  'Mechanical Engineering',
  'Artificial Intelligence and Data Science',
  'Cyber Security',
  'Electronics and Electrical Engineering',
  'Electronics and Communication Engineering',
  'Electronics and Computer Engineering',
  'Computer Science with AI',
] as const;

export const SECTION_OPTIONS = ['A', 'B', 'C', 'D'] as const;

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
  'Electronics and Electrical Engineering': [
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
};

export const getSpecializationOptions = (department?: string | null): string[] => {
  if (!department) return [];
  return SPECIALIZATION_BY_DEPARTMENT[department] ?? [];
};

