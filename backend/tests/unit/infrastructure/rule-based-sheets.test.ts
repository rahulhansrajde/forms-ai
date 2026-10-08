import type { ChatIntent } from '@forms-ai/contracts';
import { describe, expect, it } from 'vitest';
import type { AIConversationContext } from '../../../src/domain/interfaces/ai-provider.js';
import { RuleBasedIntentClassifier } from '../../../src/infrastructure/ai/rule-based/rule-based-intent-classifier.js';
import { RuleBasedSheetPlanner } from '../../../src/infrastructure/ai/rule-based/rule-based-sheet-planner.js';
import { TextMatcher } from '../../../src/infrastructure/ai/rule-based/text-matcher.js';
import { sampleForm } from '../../support/domain-fixtures.js';

const SPREADSHEET = {
  title: 'Event Leads',
  tabs: [{ title: 'Sheet1', rowCount: 1000, columnCount: 26, headers: ['Name', 'Email', 'Phone'] }],
};

function context(options: { spreadsheet?: boolean; form?: boolean } = {}): AIConversationContext {
  return {
    recentTurns: [],
    currentForm: options.form ? sampleForm() : null,
    openSuggestions: [],
    ...(options.spreadsheet ? { currentSpreadsheet: SPREADSHEET } : {}),
  };
}

describe('RuleBasedIntentClassifier for Google Sheets', () => {
  const classifier = new RuleBasedIntentClassifier(new TextMatcher());

  it.each<[string, AIConversationContext, ChatIntent]>([
    ['Create a spreadsheet for event registrations', context(), 'CREATE_SHEET'],
    ['Make a Google Sheet called Budget with columns Item, Amount', context(), 'CREATE_SHEET'],
    ['Create a spreadsheet with a tab called Leads', context(), 'CREATE_SHEET'],
    ['Add a tab called Archive', context({ spreadsheet: true }), 'MODIFY_SHEET'],
    ['Create a new tab called Archive', context({ spreadsheet: true }), 'MODIFY_SHEET'],
    ['Add a column called Company after Email', context({ spreadsheet: true }), 'MODIFY_SHEET'],
    ['Clear column B', context({ spreadsheet: true }), 'MODIFY_SHEET'],
    ['Show me the first 10 rows', context({ spreadsheet: true }), 'READ_SHEET'],
    ['How many tabs does the spreadsheet have?', context({ spreadsheet: true }), 'READ_SHEET'],
    ['Read A1:C5', context({ spreadsheet: true }), 'READ_SHEET'],
    ['Create a college hackathon registration form.', context(), 'CREATE_FORM'],
    ['Add a column called Company', context({ form: true }), 'MODIFY_FORM'],
    ['Show me the first 10 rows', context(), 'NORMAL_CHAT'],
    ['Publish this form to Google Forms', context({ form: true, spreadsheet: true }), 'CREATE_GOOGLE_FORM'],
  ])('classifies "%s"', (message, conversation, intent) => {
    expect(classifier.classify(message, conversation).intent).toBe(intent);
  });
});

describe('RuleBasedSheetPlanner', () => {
  const planner = new RuleBasedSheetPlanner();

  function plan(kind: 'CREATE' | 'MODIFY' | 'READ', instruction: string) {
    return planner.plan({ instruction, kind, context: context({ spreadsheet: kind !== 'CREATE' }) });
  }

  it('creates only the structure that was asked for', () => {
    expect(plan('CREATE', 'Create a spreadsheet called Event Leads with columns Name, Email and Phone').operations).toEqual([
      { type: 'CREATE_SPREADSHEET', title: 'Event Leads', tabs: [{ title: 'Sheet1', headers: ['Name', 'Email', 'Phone'] }] },
    ]);
    expect(plan('CREATE', 'Create a spreadsheet for our book club').operations).toEqual([
      { type: 'CREATE_SPREADSHEET', title: 'Book Club', tabs: [{ title: 'Sheet1' }] },
    ]);
    expect(plan('CREATE', 'Create a spreadsheet called CRM with a tab called Leads and columns Name, Stage').operations).toEqual([
      { type: 'CREATE_SPREADSHEET', title: 'CRM', tabs: [{ title: 'Leads', headers: ['Name', 'Stage'] }] },
    ]);
  });

  it('plans changes relative to the known headers', () => {
    expect(plan('MODIFY', 'Add a column called Company after Email').operations).toEqual([
      { type: 'INSERT_COLUMNS', beforeColumn: 'C', count: 1 },
      { type: 'WRITE_RANGE', range: 'C1', values: [['Company']] },
    ]);
    expect(plan('MODIFY', 'Add a column called Notes').operations).toEqual([{ type: 'WRITE_RANGE', range: 'D1', values: [['Notes']] }]);
    expect(plan('MODIFY', 'Rename the Phone column to Mobile').operations).toEqual([{ type: 'WRITE_RANGE', range: 'C1', values: [['Mobile']] }]);
    expect(plan('MODIFY', 'Add 20 rows').operations).toEqual([{ type: 'INSERT_ROWS', count: 20 }]);
    expect(plan('MODIFY', 'Clear column B').operations).toEqual([{ type: 'CLEAR_RANGE', range: 'B2:B' }]);
    expect(plan('MODIFY', 'Make the first row bold').operations).toEqual([{ type: 'UPDATE_CELL_FORMAT', range: '1:1', bold: true }]);
    expect(plan('MODIFY', 'Delete the tab Archive').operations).toEqual([{ type: 'DELETE_SHEET_TAB', sheet: 'Archive' }]);
  });

  it('asks instead of guessing when the change is unclear', () => {
    const result = plan('MODIFY', 'Make it look nicer');
    expect(result.operations).toEqual([]);
    expect(result.clarificationQuestion).toContain('Which change');
  });

  it('reads explicit ranges, the structure or the first rows', () => {
    expect(plan('READ', 'Read b2:c9').operations).toEqual([{ type: 'READ_RANGE', range: 'B2:C9' }]);
    expect(plan('READ', 'What columns does it have?').operations).toEqual([{ type: 'GET_SPREADSHEET' }]);
    expect(plan('READ', 'Show me the first 5 rows').operations).toEqual([{ type: 'READ_RANGE', range: 'A1:C6' }]);
  });
});

describe('rule-based handling of existing Google Sheets', () => {
  const classifier = new RuleBasedIntentClassifier(new TextMatcher());
  const planner = new RuleBasedSheetPlanner();

  it.each<[string, AIConversationContext, ChatIntent]>([
    ['Use this sheet instead', context({ spreadsheet: true }), 'LINK_SHEET'],
    ['Switch to my registrations sheet', context({ spreadsheet: true }), 'LINK_SHEET'],
    ['Work on this spreadsheet', context(), 'LINK_SHEET'],
    ['Rename Sheet1 to Registrations', context({ spreadsheet: true }), 'MODIFY_SHEET'],
    ['Read the data and summarize it', context({ spreadsheet: true }), 'READ_SHEET'],
    ['Use the email column for contact details', context({ spreadsheet: true }), 'NORMAL_CHAT'],
  ])('classifies "%s"', (message, conversation, intent) => {
    expect(classifier.classify(message, conversation).intent).toBe(intent);
  });

  it('plans named columns, tab renames and summaries without inventing data', () => {
    const plan = (kind: 'MODIFY' | 'READ', instruction: string) => planner.plan({ instruction, kind, context: context({ spreadsheet: true }) }).operations;
    expect(plan('MODIFY', 'Add a Phone Number column')).toEqual([{ type: 'WRITE_RANGE', range: 'D1', values: [['Phone Number']] }]);
    expect(plan('MODIFY', 'Add a new column')).toEqual([]);
    expect(plan('MODIFY', 'Rename Sheet1 to Registrations')).toEqual([{ type: 'RENAME_SHEET', sheet: 'Sheet1', newTitle: 'Registrations' }]);
    expect(plan('READ', 'Read the data and summarize it')).toEqual([{ type: 'READ_RANGE', range: 'A1:C201', summarize: true }]);
    expect(plan('READ', 'Summarize A1:B10')).toEqual([{ type: 'READ_RANGE', range: 'A1:B10', summarize: true }]);
  });

  it('summarizes only the values that were read', () => {
    const summary = planner.summarize({
      instruction: 'Summarize',
      spreadsheetTitle: 'Leads',
      table: { range: "'Sheet1'!A1:C4", label: 'Sheet1 · 2 rows', values: [['Name', 'Email', ''], ['Ada', 'ada@example.com'], ['Alan', '']], totalRows: 3, truncated: false },
    });
    expect(summary).toBe('“Leads” has 2 rows below the header row in Sheet1. Values per column: Name: 2 filled, Email: 1 filled, C: 0 filled.');
  });
});
