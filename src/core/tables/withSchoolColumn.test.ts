import {withSchoolColumn} from './withSchoolColumn';
import type {ColumnDef} from './DataTable';
test('aggregate school is visible even when the school-specific column defaults to hidden',()=>{
  type Row={name:string;branchShort:string};
  const columns:ColumnDef<Row>[]=[{key:'name',label:'Имя',type:'text'},{key:'branchShort',label:'Школа',type:'text',visible:false}];
  const result=withSchoolColumn(columns,row=>row.branchShort);
  expect(result.map(column=>column.key)).toEqual(['name','allRecordsSchool']);
  expect(result[1].visible).toBe(true);
  expect(result[1].getValue?.({name:'Ученик',branchShort:'ABL #2'})).toBe('ABL #2');
  expect(columns[1].visible).toBe(false);
});
