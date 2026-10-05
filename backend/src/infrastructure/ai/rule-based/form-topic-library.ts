import type { QuestionInput } from '@forms-ai/contracts';

export interface TopicSection {
  title: string;
  description: string;
  questions: QuestionInput[];
}

export interface FormTopic {
  id: string;
  pattern: RegExp;
  title: string;
  description: string;
  sections: TopicSection[];
  suggestionPool: QuestionInput[];
}

const fullName: QuestionInput = { type: 'SHORT_ANSWER', title: 'Full Name', required: true };
const email: QuestionInput = { type: 'EMAIL', title: 'Email Address', required: true };
const phone: QuestionInput = { type: 'SHORT_ANSWER', title: 'Phone Number', required: false };
const comments: QuestionInput = { type: 'PARAGRAPH', title: 'Additional Comments', required: false };
const referral: QuestionInput = {
  type: 'DROPDOWN',
  title: 'How Did You Hear About Us?',
  required: false,
  options: ['Social media', 'Friend or colleague', 'Email', 'Website', 'Other'],
};

export const GENERIC_SUGGESTIONS: readonly QuestionInput[] = [
  phone,
  { type: 'SHORT_ANSWER', title: 'Organization', required: false },
  referral,
  { type: 'LINEAR_SCALE', title: 'Overall Satisfaction', required: false, scale: { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' } },
  comments,
  { type: 'CHECKBOXES', title: 'Consent', required: true, options: ['I agree to the terms and privacy policy'] },
];

export const FORM_TOPICS: readonly FormTopic[] = [
  {
    id: 'hackathon',
    pattern: /\bhackathon|hack ?day|coding (contest|competition)\b/i,
    title: 'Hackathon Registration',
    description: 'Register for the hackathon. We will contact you with event details.',
    sections: [
      {
        title: 'Participant Information',
        description: '',
        questions: [
          fullName,
          email,
          { type: 'SHORT_ANSWER', title: 'College Name', required: true },
          {
            type: 'DROPDOWN',
            title: 'Year of Study',
            required: true,
            options: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate'],
          },
          phone,
        ],
      },
      {
        title: 'Team Details',
        description: '',
        questions: [
          { type: 'SHORT_ANSWER', title: 'Team Name', required: true },
          { type: 'DROPDOWN', title: 'Team Size', required: true, options: ['1', '2', '3', '4'] },
          {
            type: 'CHECKBOXES',
            title: 'Primary Skills',
            required: false,
            options: ['Frontend', 'Backend', 'Machine Learning', 'Design', 'Hardware', 'Other'],
          },
        ],
      },
    ],
    suggestionPool: [
      { type: 'SHORT_ANSWER', title: 'College Name', required: true },
      phone,
      { type: 'CHECKBOXES', title: 'Skills', required: false, options: ['Frontend', 'Backend', 'Machine Learning', 'Design', 'Hardware'] },
      { type: 'DROPDOWN', title: 'Team Size', required: true, options: ['1', '2', '3', '4'] },
      { type: 'SHORT_ANSWER', title: 'GitHub Profile', required: false },
      { type: 'MULTIPLE_CHOICE', title: 'Have You Participated in a Hackathon Before?', required: false, options: ['Yes', 'No'] },
      { type: 'PARAGRAPH', title: 'Project Idea', required: false },
      { type: 'DROPDOWN', title: 'T-Shirt Size', required: false, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
      { type: 'SHORT_ANSWER', title: 'Dietary Restrictions', required: false },
      { type: 'SHORT_ANSWER', title: 'LinkedIn Profile', required: false },
      { type: 'MULTIPLE_CHOICE', title: 'Do You Need Accommodation?', required: false, options: ['Yes', 'No'] },
    ],
  },
  {
    id: 'feedback',
    pattern: /\bfeedback|review|evaluation|satisfaction\b/i,
    title: 'Feedback Form',
    description: 'We value your feedback. It takes about two minutes.',
    sections: [
      {
        title: '',
        description: '',
        questions: [
          { type: 'SHORT_ANSWER', title: 'Name', required: false },
          { type: 'SHORT_ANSWER', title: 'Course or Session', required: true },
          {
            type: 'LINEAR_SCALE',
            title: 'Overall Rating',
            required: true,
            scale: { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' },
          },
          { type: 'PARAGRAPH', title: 'What Did You Like Most?', required: false },
          { type: 'PARAGRAPH', title: 'What Could Be Improved?', required: false },
          { type: 'MULTIPLE_CHOICE', title: 'Would You Recommend It to Others?', required: true, options: ['Yes', 'No', 'Maybe'] },
        ],
      },
    ],
    suggestionPool: [
      { type: 'LINEAR_SCALE', title: 'Content Quality', required: false, scale: { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' } },
      { type: 'LINEAR_SCALE', title: 'Instructor Effectiveness', required: false, scale: { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent' } },
      { type: 'MULTIPLE_CHOICE', title: 'Was the Pace Appropriate?', required: false, options: ['Too slow', 'Just right', 'Too fast'] },
      { type: 'PARAGRAPH', title: 'Topics You Would Like Covered Next', required: false },
      email,
      { type: 'DATE', title: 'Date of Session', required: false },
    ],
  },
  {
    id: 'internship',
    pattern: /\bintern(ship)?s?\b/i,
    title: 'Internship Information Form',
    description: 'Tell us about yourself and your internship preferences.',
    sections: [
      {
        title: 'Personal Details',
        description: '',
        questions: [fullName, email, phone, { type: 'SHORT_ANSWER', title: 'College or University', required: true }],
      },
      {
        title: 'Internship Preferences',
        description: '',
        questions: [
          { type: 'SHORT_ANSWER', title: 'Degree Program', required: true },
          { type: 'DROPDOWN', title: 'Expected Graduation Year', required: true, options: ['2026', '2027', '2028', '2029'] },
          {
            type: 'CHECKBOXES',
            title: 'Preferred Domains',
            required: true,
            options: ['Software Development', 'Data Science', 'Design', 'Marketing', 'Operations'],
          },
          { type: 'DATE', title: 'Available Start Date', required: true },
          { type: 'DROPDOWN', title: 'Preferred Duration', required: true, options: ['1 month', '2 months', '3 months', '6 months'] },
        ],
      },
    ],
    suggestionPool: [
      { type: 'SHORT_ANSWER', title: 'Resume Link', required: false },
      { type: 'PARAGRAPH', title: 'Why Are You Interested in This Internship?', required: false },
      { type: 'SHORT_ANSWER', title: 'Portfolio or GitHub Link', required: false },
      { type: 'MULTIPLE_CHOICE', title: 'Preferred Work Mode', required: false, options: ['On-site', 'Remote', 'Hybrid'] },
      { type: 'SHORT_ANSWER', title: 'Current CGPA', required: false },
      referral,
    ],
  },
  {
    id: 'job',
    pattern: /\bjob|hiring|recruit|applicant|career|position\b/i,
    title: 'Job Application Form',
    description: 'Apply for an open position.',
    sections: [
      {
        title: '',
        description: '',
        questions: [
          fullName,
          email,
          phone,
          { type: 'DROPDOWN', title: 'Position Applied For', required: true, options: ['Engineering', 'Design', 'Sales', 'Operations'] },
          { type: 'DROPDOWN', title: 'Years of Experience', required: true, options: ['0-1', '2-4', '5-9', '10+'] },
          { type: 'SHORT_ANSWER', title: 'Resume Link', required: true },
          { type: 'DATE', title: 'Earliest Start Date', required: false },
        ],
      },
    ],
    suggestionPool: [
      { type: 'PARAGRAPH', title: 'Cover Letter', required: false },
      { type: 'SHORT_ANSWER', title: 'LinkedIn Profile', required: false },
      { type: 'SHORT_ANSWER', title: 'Expected Salary', required: false },
      { type: 'MULTIPLE_CHOICE', title: 'Are You Willing to Relocate?', required: false, options: ['Yes', 'No'] },
      referral,
    ],
  },
  {
    id: 'event',
    pattern: /\bevent|workshop|webinar|conference|seminar|meetup|registration|register|sign[- ]?up\b/i,
    title: 'Event Registration',
    description: 'Reserve your spot for the event.',
    sections: [
      {
        title: '',
        description: '',
        questions: [
          fullName,
          email,
          { type: 'SHORT_ANSWER', title: 'Organization', required: false },
          { type: 'MULTIPLE_CHOICE', title: 'Will You Attend In Person or Online?', required: true, options: ['In person', 'Online'] },
          { type: 'SHORT_ANSWER', title: 'Dietary Restrictions', required: false },
        ],
      },
    ],
    suggestionPool: [phone, { type: 'SHORT_ANSWER', title: 'Job Title', required: false }, referral, comments],
  },
  {
    id: 'rsvp',
    pattern: /\brsvp|party|wedding|birthday|invitation|dinner\b/i,
    title: 'RSVP',
    description: 'Let us know if you can make it.',
    sections: [
      {
        title: '',
        description: '',
        questions: [
          fullName,
          { type: 'MULTIPLE_CHOICE', title: 'Will You Attend?', required: true, options: ['Yes', 'No', 'Maybe'] },
          { type: 'DROPDOWN', title: 'Number of Guests', required: false, options: ['0', '1', '2', '3', '4'] },
          { type: 'SHORT_ANSWER', title: 'Dietary Restrictions', required: false },
        ],
      },
    ],
    suggestionPool: [email, phone, { type: 'PARAGRAPH', title: 'Message for the Host', required: false }],
  },
  {
    id: 'contact',
    pattern: /\bcontact|inquiry|enquiry|support|query|queries\b/i,
    title: 'Contact Form',
    description: 'Send us a message and we will get back to you.',
    sections: [
      {
        title: '',
        description: '',
        questions: [
          fullName,
          email,
          { type: 'SHORT_ANSWER', title: 'Subject', required: true },
          { type: 'PARAGRAPH', title: 'Message', required: true },
        ],
      },
    ],
    suggestionPool: [
      phone,
      { type: 'DROPDOWN', title: 'Topic', required: false, options: ['General', 'Support', 'Billing', 'Partnership'] },
      { type: 'MULTIPLE_CHOICE', title: 'Preferred Contact Method', required: false, options: ['Email', 'Phone'] },
    ],
  },
  {
    id: 'survey',
    pattern: /\bsurvey|questionnaire|poll|research|opinion\b/i,
    title: 'Survey',
    description: 'Thank you for taking part in this survey.',
    sections: [
      {
        title: '',
        description: '',
        questions: [
          { type: 'DROPDOWN', title: 'Age Range', required: false, options: ['Under 18', '18-24', '25-34', '35-44', '45+'] },
          {
            type: 'LINEAR_SCALE',
            title: 'Overall Satisfaction',
            required: true,
            scale: { min: 1, max: 5, minLabel: 'Very unsatisfied', maxLabel: 'Very satisfied' },
          },
          { type: 'MULTIPLE_CHOICE', title: 'How Often Do You Use It?', required: true, options: ['Daily', 'Weekly', 'Monthly', 'Rarely'] },
          { type: 'PARAGRAPH', title: 'Any Suggestions?', required: false },
        ],
      },
    ],
    suggestionPool: [
      email,
      { type: 'CHECKBOXES', title: 'Which Features Do You Use?', required: false, options: ['Feature A', 'Feature B', 'Feature C'] },
      { type: 'MULTIPLE_CHOICE', title: 'Would You Recommend Us?', required: false, options: ['Yes', 'No', 'Maybe'] },
    ],
  },
];

export const GENERIC_TOPIC: FormTopic = {
  id: 'generic',
  pattern: /$^/,
  title: 'Untitled Form',
  description: '',
  sections: [{ title: '', description: '', questions: [fullName, email, comments] }],
  suggestionPool: [],
};
