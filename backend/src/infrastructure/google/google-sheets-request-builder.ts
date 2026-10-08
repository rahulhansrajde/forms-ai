import type { CellFormatChange, StructuralChange } from '../../domain/interfaces/sheets.js';

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

export class GoogleSheetsRequestBuilder {
  build(change: StructuralChange): Record<string, unknown> {
    switch (change.kind) {
      case 'ADD_TAB':
        return { addSheet: { properties: { title: change.title } } };
      case 'RENAME_TAB':
        return { updateSheetProperties: { properties: { sheetId: change.sheetId, title: change.title }, fields: 'title' } };
      case 'DELETE_TAB':
        return { deleteSheet: { sheetId: change.sheetId } };
      case 'INSERT_DIMENSION':
        return {
          insertDimension: {
            range: { sheetId: change.sheetId, dimension: change.dimension, startIndex: change.startIndex, endIndex: change.startIndex + change.count },
            inheritFromBefore: change.startIndex > 0,
          },
        };
      case 'APPEND_DIMENSION':
        return { appendDimension: { sheetId: change.sheetId, dimension: change.dimension, length: change.count } };
      case 'DELETE_DIMENSION':
        return {
          deleteDimension: {
            range: { sheetId: change.sheetId, dimension: change.dimension, startIndex: change.startIndex, endIndex: change.startIndex + change.count },
          },
        };
      case 'FORMAT_CELLS':
        return {
          repeatCell: {
            range: { sheetId: change.sheetId, ...change.bounds },
            cell: { userEnteredFormat: this.format(change.format) },
            fields: this.formatFields(change.format),
          },
        };
      case 'RESIZE_DIMENSION':
        return {
          updateDimensionProperties: {
            range: { sheetId: change.sheetId, dimension: change.dimension, startIndex: change.startIndex, endIndex: change.startIndex + change.count },
            properties: { pixelSize: change.pixelSize },
            fields: 'pixelSize',
          },
        };
      case 'FREEZE_ROWS':
        return {
          updateSheetProperties: {
            properties: { sheetId: change.sheetId, gridProperties: { frozenRowCount: change.count } },
            fields: 'gridProperties.frozenRowCount',
          },
        };
      case 'RENAME_SPREADSHEET':
        return { updateSpreadsheetProperties: { properties: { title: change.title }, fields: 'title' } };
    }
  }

  private format(format: CellFormatChange): Record<string, unknown> {
    const textFormat = {
      ...(format.bold === undefined ? {} : { bold: format.bold }),
      ...(format.italic === undefined ? {} : { italic: format.italic }),
      ...(format.textColor ? { foregroundColor: this.color(format.textColor) } : {}),
    };
    return {
      ...(Object.keys(textFormat).length > 0 ? { textFormat } : {}),
      ...(format.backgroundColor ? { backgroundColor: this.color(format.backgroundColor) } : {}),
      ...(format.horizontalAlignment ? { horizontalAlignment: format.horizontalAlignment } : {}),
    };
  }

  private formatFields(format: CellFormatChange): string {
    const fields = [
      format.bold === undefined ? null : 'textFormat.bold',
      format.italic === undefined ? null : 'textFormat.italic',
      format.textColor ? 'textFormat.foregroundColor' : null,
      format.backgroundColor ? 'backgroundColor' : null,
      format.horizontalAlignment ? 'horizontalAlignment' : null,
    ].filter((field): field is string => field !== null);
    return `userEnteredFormat(${fields.join(',')})`;
  }

  private color(hex: string): RgbColor {
    const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return { red: channel(1), green: channel(3), blue: channel(5) };
  }
}
