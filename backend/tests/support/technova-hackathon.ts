import type { FormQuestion, FormSchema, FormSection } from '@forms-ai/contracts';

function question(id: string, type: FormQuestion['type'], title: string, options?: string[], description = ''): FormQuestion {
  return { id, type, title, description, required: true, ...(options ? { options } : {}) };
}

const leaderSection: FormSection = {
  id: 'section_leader',
  title: 'Team Leader Information',
  description: '',
  questions: [
    question('question_01', 'SHORT_ANSWER', 'Team leader name'),
    question('question_02', 'EMAIL', 'Email address'),
    question('question_03', 'SHORT_ANSWER', 'Phone number'),
    question('question_04', 'SHORT_ANSWER', 'College name'),
    question('question_05', 'DROPDOWN', 'Department', [
      'Computer Science',
      'Information Technology',
      'Electronics & Communication',
      'Electrical Engineering',
      'Mechanical Engineering',
      'Civil Engineering',
      'Biotechnology',
      'Other',
    ]),
    question('question_06', 'SHORT_ANSWER', 'Major / Field of Study'),
    question('question_07', 'DROPDOWN', 'Year of study', ['1st Year', '2nd Year', '3rd Year', '4th Year']),
  ],
};

const teamSection: FormSection = {
  id: 'section_team',
  title: 'Team Details',
  description: '',
  questions: [
    question('question_08', 'SHORT_ANSWER', 'Team name'),
    question('question_09', 'DROPDOWN', 'Number of team members', ['1 (Solo)', '2', '3', '4', '5']),
    question('question_10', 'PARAGRAPH', "Team members' names", undefined, 'List the names of all team members (one per line)'),
    question(
      'question_11',
      'CHECKBOXES',
      'Technical skills',
      [
        'Web Development',
        'Mobile App Development',
        'Machine Learning / AI',
        'Data Science',
        'Blockchain',
        'Cloud Computing',
        'IoT',
        'Cybersecurity',
        'Game Development',
        'UI/UX Design',
      ],
      'Select all that apply to your team',
    ),
  ],
};

const projectSection: FormSection = {
  id: 'section_project',
  title: 'Project Information',
  description: '',
  questions: [
    question('question_12', 'DROPDOWN', 'Preferred hackathon domain', [
      'FinTech',
      'HealthTech',
      'EdTech',
      'AgriTech',
      'CleanTech',
      'Social Impact',
      'Open Innovation',
      'Other',
    ]),
    question('question_13', 'MULTIPLE_CHOICE', 'Have you participated in a hackathon before?', [
      'Yes, multiple times',
      'Yes, once',
      'No, this is my first time',
    ]),
    question('question_14', 'SHORT_ANSWER', 'GitHub profile link'),
    question('question_15', 'PARAGRAPH', 'Project idea', undefined, 'Provide a brief title for your proposed project'),
    question(
      'question_16',
      'PARAGRAPH',
      'Briefly describe your proposed solution',
      undefined,
      'Explain your project idea, the problem it solves, and the technology you plan to use',
    ),
    question('question_17', 'DROPDOWN', 'Preferred Role in the Team', ['Team Leader', 'Developer', 'Designer', 'Presenter', 'Other']),
  ],
};

const header = { title: 'TechNova Hackathon 2026', description: 'Register your team for the TechNova Hackathon 2026.' };

export const technovaVersion1: FormSchema = {
  ...header,
  sections: [{ ...leaderSection, questions: leaderSection.questions.slice(0, 4) }],
};

export const technovaVersion2: FormSchema = { ...header, sections: [leaderSection, teamSection] };

export const technovaVersion3: FormSchema = { ...header, sections: [leaderSection, teamSection, projectSection] };
