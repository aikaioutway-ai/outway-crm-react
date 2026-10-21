import type { ColumnDef } from './DataTable';

/** Give aggregate lists their own school column, independent of school-specific saved layouts. */
export function withSchoolColumn<T>(columns: ColumnDef<T>[], getSchool: (row: T) => string): ColumnDef<T>[] {
  const school: ColumnDef<T> = { key: 'allRecordsSchool', label: 'Школа', type: 'text', category: 'Клиент', width: 110, visible: true, getValue: getSchool };
  const result = columns.filter(column => !['branchShort', 'branchShorts', 'schoolKey'].includes(column.key));
  const nameIndex = result.findIndex(column => ['parentName', 'childName', 'fullName', 'name'].includes(column.key));
  result.splice(nameIndex < 0 ? 0 : nameIndex + 1, 0, school);
  return result;
}
