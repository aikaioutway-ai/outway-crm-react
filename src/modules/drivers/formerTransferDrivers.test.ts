import {withFormerTransferDrivers} from './formerTransferDrivers';
test('former driver is associated with the historic transfer without modifying current assignments',()=>{
  const current={driverId:'current',rowId:'current',fullName:'Текущий',transfers:[{id:'t'}]} as any;
  const former={driverId:'former',rowId:'former',fullName:'Прежний',status:'inactive',transfers:[],branchIds:[],transferCount:0} as any;
  const transfer={id:'t',driverId:'current',branchId:'b',branchCode:'TENSAY',branchShort:'TIS',branchName:'TIS',transferNumber:'1'} as any;
  const history={transferId:'t',previousDriverId:'former',driverId:'current'} as any;
  const rows=withFormerTransferDrivers([current,former],[transfer],[history,history]);
  expect(rows.filter(row=>row.previousAssignment)).toHaveLength(1);
  expect(rows[0].driverId).toBe('current');
  expect(rows[2]).toMatchObject({driverId:'former',previousAssignment:true,transferNumbers:'№1',branchCodes:['TENSAY'],childrenCount:0});
  expect(former.transfers).toEqual([]);
  expect(withFormerTransferDrivers([current,former],[],[history])).toHaveLength(2);
});
