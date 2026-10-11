import type { SheetTableView } from '@forms-ai/contracts';
import styles from './sheet-table.module.css';

const STRUCTURE_RANGE = 'Spreadsheet structure';
const STARTS_AT_FIRST_ROW = /(?:^|!)[A-Z]{0,3}1(?:$|:)/;

function hasHeaderRow(table: SheetTableView): boolean {
  return table.range === STRUCTURE_RANGE || table.record !== undefined || STARTS_AT_FIRST_ROW.test(table.range);
}

export function SheetTable({ table }: { table: SheetTableView }) {
  if (table.values.length === 0) {
    return <p className={styles.empty}>{table.label.split(' · ')[0]} has no data there yet.</p>;
  }
  const width = Math.max(...table.values.map((row) => row.length));
  const header = hasHeaderRow(table) ? table.values[0] : null;
  const body = header ? table.values.slice(1) : table.values;
  const pad = (row: readonly string[]) => Array.from({ length: width }, (_value, index) => row[index] ?? '');

  return (
    <figure className={styles.figure}>
      <div className={styles.scroller} role="region" aria-label={`Values from ${table.label}`} tabIndex={0}>
        <table className={styles.table}>
          {header ? (
            <thead>
              <tr>
                {pad(header).map((cell, index) => (
                  <th key={index} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {pad(row).map((cell, index) => (
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className={styles.caption}>{table.label}</figcaption>
    </figure>
  );
}
