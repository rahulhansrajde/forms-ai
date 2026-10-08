import { SHEET_LIMITS, type SheetOperation } from '@forms-ai/contracts';
import { z } from 'zod';
import { A1Notation } from './a1-notation.js';

const notation = new A1Notation();
function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

const titleSchema = z
  .string()
  .trim()
  .min(1, 'A title is required.')
  .max(SHEET_LIMITS.titleMaxLength)
  .refine((value) => !hasControlCharacter(value), 'Titles cannot contain control characters.');

const sheetReferenceSchema = titleSchema.optional();

const rangeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => notation.isRange(value), 'Use A1 notation for ranges, for example A1:D20.');

const cellSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => notation.isCell(value), 'Use a single cell in A1 notation, for example C2.');

const columnSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => notation.isColumn(value), 'Use a column letter, for example C.');

const cellValueSchema = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((value) => String(value))
  .pipe(z.string().max(SHEET_LIMITS.cellMaxLength));

const rowSchema = z.array(cellValueSchema).max(SHEET_LIMITS.maxWriteColumns);
const valuesSchema = z.array(rowSchema).min(1, 'At least one row is required.').max(SHEET_LIMITS.maxWriteRows);
const headersSchema = z.array(cellValueSchema.pipe(z.string().trim().min(1, 'Headers cannot be empty.'))).min(1).max(SHEET_LIMITS.maxWriteColumns);
const rowNumberSchema = z.number().int().min(1).max(10_000_000);
const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be hex values such as #FFAA00.');

const tabBlueprintSchema = z
  .object({
    title: titleSchema,
    headers: headersSchema.optional(),
    rows: valuesSchema.optional(),
  })
  .strict();

export const sheetOperationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('CREATE_SPREADSHEET'),
      title: titleSchema,
      tabs: z.array(tabBlueprintSchema).min(1).max(10),
    })
    .strict(),
  z.object({ type: z.literal('GET_SPREADSHEET') }).strict(),
  z.object({ type: z.literal('READ_RANGE'), sheet: sheetReferenceSchema, range: rangeSchema, summarize: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('WRITE_RANGE'), sheet: sheetReferenceSchema, range: rangeSchema, values: valuesSchema }).strict(),
  z.object({ type: z.literal('UPDATE_RANGE'), sheet: sheetReferenceSchema, range: rangeSchema, values: valuesSchema }).strict(),
  z.object({ type: z.literal('APPEND_ROWS'), sheet: sheetReferenceSchema, values: valuesSchema }).strict(),
  z.object({ type: z.literal('CLEAR_RANGE'), sheet: sheetReferenceSchema, range: rangeSchema }).strict(),
  z.object({ type: z.literal('ADD_SHEET'), title: titleSchema }).strict(),
  z.object({ type: z.literal('RENAME_SHEET'), sheet: titleSchema, newTitle: titleSchema }).strict(),
  z.object({ type: z.literal('DELETE_SHEET_TAB'), sheet: titleSchema }).strict(),
  z
    .object({
      type: z.literal('INSERT_ROWS'),
      sheet: sheetReferenceSchema,
      beforeRow: rowNumberSchema.optional(),
      count: z.number().int().min(1).max(SHEET_LIMITS.maxInsertRows),
    })
    .strict(),
  z
    .object({
      type: z.literal('INSERT_COLUMNS'),
      sheet: sheetReferenceSchema,
      beforeColumn: columnSchema.optional(),
      count: z.number().int().min(1).max(SHEET_LIMITS.maxInsertColumns),
    })
    .strict(),
  z
    .object({
      type: z.literal('DELETE_ROWS'),
      sheet: sheetReferenceSchema,
      startRow: rowNumberSchema,
      count: z.number().int().min(1).max(SHEET_LIMITS.maxInsertRows),
    })
    .strict(),
  z
    .object({
      type: z.literal('DELETE_COLUMNS'),
      sheet: sheetReferenceSchema,
      startColumn: columnSchema,
      count: z.number().int().min(1).max(SHEET_LIMITS.maxInsertColumns),
    })
    .strict(),
  z
    .object({
      type: z.literal('UPDATE_CELL_FORMAT'),
      sheet: sheetReferenceSchema,
      range: rangeSchema,
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      backgroundColor: colorSchema.optional(),
      textColor: colorSchema.optional(),
      horizontalAlignment: z.enum(['LEFT', 'CENTER', 'RIGHT']).optional(),
    })
    .strict()
    .refine(
      (operation) =>
        [operation.bold, operation.italic, operation.backgroundColor, operation.textColor, operation.horizontalAlignment].some((value) => value !== undefined),
      'A format change needs at least one formatting property.',
    ),
  z
    .object({
      type: z.literal('UPDATE_DIMENSION_SIZE'),
      sheet: sheetReferenceSchema,
      dimension: z.enum(['ROWS', 'COLUMNS']),
      start: z.string().trim().toUpperCase().regex(/^(?:[A-Z]{1,3}|[1-9]\d{0,6})$/, 'Use a column letter or a row number.'),
      count: z.number().int().min(1).max(SHEET_LIMITS.maxInsertColumns),
      pixelSize: z.number().int().min(SHEET_LIMITS.minPixelSize).max(SHEET_LIMITS.maxPixelSize),
    })
    .strict(),
  z.object({ type: z.literal('SET_HEADER_ROW'), sheet: sheetReferenceSchema, headers: headersSchema }).strict(),
  z
    .object({
      type: z.literal('SET_FORMULA'),
      sheet: sheetReferenceSchema,
      cell: cellSchema,
      formula: z.string().trim().min(2).max(SHEET_LIMITS.cellMaxLength).startsWith('=', 'Formulas must start with =.'),
    })
    .strict(),
  z.object({ type: z.literal('UPDATE_SPREADSHEET_TITLE'), title: titleSchema }).strict(),
  z
    .object({
      type: z.literal('UPDATE_RECORD'),
      sheet: sheetReferenceSchema,
      match: z.object({ column: titleSchema.optional(), value: z.string().trim().min(1).max(200) }).strict(),
      changes: z
        .array(z.object({ column: titleSchema, value: cellValueSchema, from: cellValueSchema.optional() }).strict())
        .min(1)
        .max(SHEET_LIMITS.maxWriteColumns),
    })
    .strict(),
]);

export const sheetOperationListSchema = z.array(sheetOperationSchema).max(SHEET_LIMITS.maxOperations);

export const sheetPlanOutputSchema = z.object({
  summary: z.string().trim().min(1).max(300),
  operations: sheetOperationListSchema,
  clarificationQuestion: z.string().trim().min(1).max(500).nullable().optional(),
});

export type SheetPlanOutput = z.infer<typeof sheetPlanOutputSchema>;

export function asSheetOperation(operation: z.infer<typeof sheetOperationSchema>): SheetOperation {
  return operation as SheetOperation;
}
