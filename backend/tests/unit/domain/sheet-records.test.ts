import { describe, expect, it } from 'vitest';
import { HeaderMatcher } from '../../../src/domain/services/header-matcher.js';
import { RecordRequestParser } from '../../../src/domain/services/record-request-parser.js';
import { SheetRecordLocator, type SheetGrid } from '../../../src/domain/services/sheet-record-locator.js';
import { TextNormalizer } from '../../../src/domain/services/text-normalizer.js';

const text = new TextNormalizer();
const matcher = new HeaderMatcher(text);
const parser = new RecordRequestParser(text, matcher);
const locator = new SheetRecordLocator(text, matcher);
const HEADERS = ['Student ID', 'Name', 'Email', 'Phone Number', 'Department', 'College', 'Year'];
const GRID: SheetGrid = {
  headers: HEADERS,
  rows: [
    ['STU001', 'Rahul', 'rahul@example.com', '98765', 'ECE', 'ABC College', '3rd Year'],
    ['STU002', ' Priya Sharma ', 'priya@example.com', '', 'CSE', 'XYZ College', '2nd Year'],
    ['STU003', 'Arjun', 'arjun@example.com', '', 'ME', 'ABC College', '1st Year'],
    ['STU004', 'Ananya', 'ananya1@example.com', '', 'CSE', 'ABC College', '2nd Year'],
    ['STU005', 'ananya', 'ananya2@example.com', '', 'IT', 'XYZ College', '4th Year'],
  ],
};

describe('TextNormalizer', () => {
  it('normalizes apostrophes, possessives, case and whitespace', () => {
    expect(text.stripPossessive('Rahul’s')).toBe('Rahul');
    expect(text.stripPossessive("Rahul's")).toBe('Rahul');
    expect(text.stripPossessive("James'")).toBe('James');
    expect(text.comparable('  RAHUL  ')).toBe('rahul');
    expect(text.clean('Rahul‘s   Year')).toBe("Rahul's Year");
  });
});

describe('RecordRequestParser', () => {
  it.each([
    ["Change Rahul's Year from 3rd Year to 4th Year.", 'Rahul', 'Year', '4th Year', '3rd Year'],
    ['Change Rahul’s Year from 3rd Year to 4th Year.', 'Rahul', 'Year', '4th Year', '3rd Year'],
    ["Set Rahul's Year to 4th Year.", 'Rahul', 'Year', '4th Year', undefined],
    ["Change Rahul's department to CSE.", 'Rahul', 'department', 'CSE', undefined],
    ["Change STU001's Year to 4th Year.", 'STU001', 'Year', '4th Year', undefined],
    ["Update rahul@example.com's Department to CSE", 'rahul@example.com', 'Department', 'CSE', undefined],
    ['Change Rahul Year from 3rd Year to 4th Year', 'Rahul', 'Year', '4th Year', '3rd Year'],
    ['Change the Year of Rahul to "4th Year"', 'Rahul', 'Year', '4th Year', undefined],
    ["  please   change  rahul's   year to 4th Year  ", 'rahul', 'year', '4th Year', undefined],
  ])('parses %s', (message, entity, column, value, from) => {
    expect(parser.parse(message, HEADERS)).toEqual({
      subject: { kind: 'VALUE', value: entity },
      changes: [{ column, value, ...(from ? { from } : {}) }],
    });
  });

  it('parses requests without a new value', () => {
    expect(parser.parse("Update Rahul's phone number.", HEADERS)).toEqual({
      subject: { kind: 'VALUE', value: 'Rahul' },
      changes: [{ column: 'phone number', value: null }],
    });
    expect(parser.parse("Change Arjun's College.", HEADERS)?.changes).toEqual([{ column: 'College', value: null }]);
  });

  it('parses pronouns and row numbers', () => {
    expect(parser.parse('Change his Year to 4th Year.', HEADERS)).toEqual({ subject: { kind: 'PRONOUN' }, changes: [{ column: 'Year', value: '4th Year' }] });
    expect(parser.parse("Change row 5's Year to 4th Year", HEADERS)?.subject).toEqual({ kind: 'ROW', row: 5 });
  });

  it.each(['Change the form title to Hackathon', 'Change Email to Email Address', 'Change the Phone column to Mobile', 'Make the first row bold', 'Show me the first 3 rows'])(
    'ignores %s',
    (message) => {
      expect(parser.parse(message, HEADERS)).toBeNull();
    },
  );

  it.each([
    ["What is Rahul's year?", { kind: 'VALUE', value: 'Rahul' }, ['year']],
    ['What is Priya Sharma’s department', { kind: 'VALUE', value: 'Priya Sharma' }, ['department']],
    ['What is the college of STU003?', { kind: 'VALUE', value: 'STU003' }, ['college']],
    ['Find student id STU001.', { kind: 'VALUE', column: 'Student ID', value: 'STU001' }, []],
    ['Find the student with email arjun@example.com', { kind: 'VALUE', column: 'Email', value: 'arjun@example.com' }, []],
    ["Show Rahul's row.", { kind: 'VALUE', value: 'Rahul' }, []],
    ['Find Priya Sharma', { kind: 'VALUE', value: 'Priya Sharma' }, []],
    ['What is his year?', { kind: 'PRONOUN' }, ['year']],
    ['What department is Arjun in, and what is his year?', { kind: 'VALUE', value: 'Arjun' }, ['department', 'year']],
    ['Find Rahul and show his phone number', { kind: 'VALUE', value: 'Rahul' }, ['phone number']],
    ["What is Rahul's favourite colour?", { kind: 'VALUE', value: 'Rahul' }, ['favourite colour']],
    ['find Priya Sharma row and get mew that row details', { kind: 'VALUE', value: 'Priya Sharma' }, []],
    ['find Priya Sharma row and get me that row details', { kind: 'VALUE', value: 'Priya Sharma' }, []],
    ['fnd priya sharma row and give me the details', { kind: 'VALUE', value: 'priya sharma' }, []],
    ['can u get Priya Sharma record pls', { kind: 'VALUE', value: 'Priya Sharma' }, []],
    ['Priya Sharma row details', { kind: 'VALUE', value: 'Priya Sharma' }, []],
    ['get me the row of Priya Sharma', { kind: 'VALUE', value: 'Priya Sharma' }, []],
    ['lookup Priya Sharma detials', { kind: 'VALUE', value: 'Priya Sharma' }, []],
    ['who is Priya Sharma', { kind: 'VALUE', value: 'Priya Sharma' }, []],
    ['show row 4', { kind: 'ROW', row: 4 }, []],
    ['show me that row details', { kind: 'PRONOUN' }, []],
    ['find Priya Sharma row and what is her year', { kind: 'VALUE', value: 'Priya Sharma' }, ['year']],
    ['show me priya sharma row alone', { kind: 'VALUE', value: 'priya sharma' }, []],
    ['show only the matching row for Priya Sharma', { kind: 'VALUE', value: 'Priya Sharma' }, []],
    ['give me the specific record of Priya Sharma', { kind: 'VALUE', value: 'Priya Sharma' }, []],
  ])('parses the record question %s', (message, subject, fields) => {
    expect(parser.parseQuestion(message, HEADERS, ['Students'])).toEqual({ subject, fields, confident: true });
  });

  it('marks a bare "show <name>" as a guess so an unmatched name falls back to a normal read', () => {
    expect(parser.parseQuestion('Show me Priya Sharma', HEADERS, ['Students'])).toEqual({ subject: { kind: 'VALUE', value: 'Priya Sharma' }, fields: [], confident: false });
    expect(parser.parseQuestion('show me data', HEADERS, ['Students'])).toBeNull();
    expect(parser.parseQuestion('tell me a joke', HEADERS, ['Students'])).toBeNull();
  });

  it.each([
    'Read first row.',
    'Read 2 rows',
    'Show the department column.',
    'Show me the first 3 rows from Students',
    'Read all rows.',
    'show me all the rows',
    'Summarize the entire spreadsheet',
    'Read the whole sheet',
    'How many students are in CSE?',
    'Read A1:F6',
    'Find Students',
    'What is the title of the form?',
    'What is the spreadsheet called?',
    'Find an unknown student',
    "What is Rahul's year and what is Priya's year?",
    "Change Rahul's Year to 4th Year.",
    'Who are you?',
    'Show me the preview',
    'Hi there',
  ])('does not treat %s as a question about one record', (message) => {
    expect(parser.parseQuestion(message, HEADERS, ['Students'])).toBeNull();
  });

  it.each([
    ['His student id is STU001', { kind: 'VALUE', column: 'Student ID', value: 'STU001' }],
    ['Its student id is stu001', { kind: 'VALUE', column: 'Student ID', value: 'stu001' }],
    ["Rahul's email is rahul@example.com.", { kind: 'VALUE', column: 'Email', value: 'rahul@example.com' }],
    ["It's row 5", { kind: 'ROW', row: 5 }],
    ['row 12', { kind: 'ROW', row: 12 }],
  ])('recognizes the identifier statement %s', (message, expected) => {
    expect(parser.parseIdentifier(message, HEADERS)).toEqual(expected);
  });

  it('does not treat ordinary field statements as identifiers', () => {
    expect(parser.parseIdentifier('The year is 4th', HEADERS)).toBeNull();
    expect(parser.parseIdentifier('Thanks, that is great', HEADERS)).toBeNull();
  });

  it('recognizes record requests only in the right context', () => {
    const none = { hasSubject: false, hasPending: false, hasDraft: false };
    expect(parser.isRecordRequest("Change Rahul's Year to 4th Year", HEADERS, none)).toBe(true);
    expect(parser.isRecordRequest('Change his Year to 4th Year', HEADERS, none)).toBe(false);
    expect(parser.isRecordRequest('Change his Year to 4th Year', HEADERS, { ...none, hasSubject: true })).toBe(true);
    expect(parser.isRecordRequest('His student id is STU001', HEADERS, none)).toBe(false);
    expect(parser.isRecordRequest('His student id is STU001', HEADERS, { ...none, hasPending: true })).toBe(true);
    expect(parser.isRecordRequest("Change Rahul's Shoe Size to 9", HEADERS, { ...none, hasDraft: true })).toBe(false);
  });
});

describe('HeaderMatcher', () => {
  it('matches headers by name, synonyms and words', () => {
    expect(matcher.find(HEADERS, 'year')).toBe(6);
    expect(matcher.find(HEADERS, 'phone')).toBe(3);
    expect(matcher.find(HEADERS, 'mobile number')).toBe(3);
    expect(matcher.find(HEADERS, 'student id')).toBe(0);
    expect(matcher.find(HEADERS, 'dept')).toBe(4);
    expect(matcher.find(HEADERS, 'shoe size')).toBeNull();
    expect(matcher.find(['Employee Name', 'Employee ID'], 'employee')).toBeNull();
  });

  it('classifies identifying headers', () => {
    expect(['Student ID', 'Employee ID', 'Order ID', 'Roll No', 'Email', 'E-mail', 'Name', 'Full Name', 'Customer Name', 'Phone Number', 'Year'].map((header) => matcher.kind(header))).toEqual([
      'IDENTIFIER',
      'IDENTIFIER',
      'IDENTIFIER',
      'IDENTIFIER',
      'EMAIL',
      'EMAIL',
      'NAME',
      'NAME',
      'NAME',
      'OTHER',
      'OTHER',
    ]);
  });
});

describe('SheetRecordLocator', () => {
  it.each([
    ['Rahul', 2, 1],
    ["Rahul's", 2, 1],
    ['Rahul’s', 2, 1],
    ['RAHUL', 2, 1],
    ['  rahul ', 2, 1],
    ['STU001', 2, 0],
    ['stu003', 4, 0],
    ['rahul@example.com', 2, 2],
  ])('finds %s', (value, row, column) => {
    expect(locator.locate(GRID, { value })).toMatchObject({ kind: 'FOUND', row, column, exact: true });
  });

  it('matches a first or last name only as a whole word inside a full name', () => {
    expect(locator.locate(GRID, { value: 'Priya' })).toMatchObject({ kind: 'FOUND', row: 3, exact: false });
    expect(locator.locate(GRID, { value: 'Sharma' })).toMatchObject({ kind: 'FOUND', row: 3, exact: false });
    expect(locator.locate(GRID, { value: 'Pri' })).toEqual({ kind: 'NOT_FOUND', column: 1 });
  });

  it('reports duplicates instead of picking one', () => {
    expect(locator.locate(GRID, { value: 'Ananya' })).toEqual({ kind: 'AMBIGUOUS', rows: [5, 6], column: 1 });
  });

  it('uses the column the user names', () => {
    expect(locator.locate(GRID, { column: 'student id', value: 'STU002' })).toMatchObject({ kind: 'FOUND', row: 3 });
    expect(locator.locate(GRID, { column: 'Employee ID', value: 'E1' })).toEqual({ kind: 'UNKNOWN_COLUMN', column: 'Employee ID' });
    expect(locator.locate(GRID, { column: 'Name', value: 'STU001' })).toEqual({ kind: 'NOT_FOUND', column: 1 });
  });

  it('finds rows by number and rejects empty rows', () => {
    expect(locator.locate(GRID, { row: 4 })).toMatchObject({ kind: 'FOUND', row: 4, column: null });
    expect(locator.locate(GRID, { row: 40 })).toEqual({ kind: 'NOT_FOUND', column: null });
    expect(locator.locate(GRID, { row: 1 })).toEqual({ kind: 'NOT_FOUND', column: null });
  });

  it('works for other kinds of sheets', () => {
    const employees: SheetGrid = { headers: ['Employee ID', 'Employee Name', 'Team'], rows: [['E-17', 'Meera Nair', 'Sales']] };
    expect(locator.locate(employees, { value: 'e-17' })).toMatchObject({ kind: 'FOUND', row: 2, column: 0 });
    expect(locator.locate(employees, { value: 'Meera Nair' })).toMatchObject({ kind: 'FOUND', row: 2, column: 1 });
    expect(locator.label(employees, employees.rows[0]!, 'E-17')).toBe('Meera Nair');
    expect(locator.identity(employees, employees.rows[0]!, 1)).toEqual({ header: 'Employee ID', value: 'E-17' });
  });
});
