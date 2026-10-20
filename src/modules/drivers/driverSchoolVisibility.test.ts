import { isVisibleDriver } from './driverSchoolVisibility';
import { isReserveDriver } from './DriversOverview';
import { V2DriverTableRow } from '../../services/crmV2Service';
const hidden={status:'active',transferCount:1,branchCodes:['BILIM'],branchShorts:['BJ'],branchNames:['Билим Жолу'],transfers:[{branchShort:'BJ',branchCode:'BILIM'}]} as V2DriverTableRow;
test('a driver assigned only to a hidden school is hidden without being reclassified as reserve',()=>{
  expect(isVisibleDriver(hidden)).toBe(false);
  expect(isReserveDriver(hidden)).toBe(false);
});
test('mixed assignments and a genuine reserve driver remain visible',()=>{
  expect(isVisibleDriver({...hidden,transfers:[...hidden.transfers,{branchShort:'TIS',branchCode:'TENSAY'} as any]})).toBe(true);
  expect(isVisibleDriver({...hidden,transferCount:0,transfers:[],branchShorts:[],branchNames:[]})).toBe(true);
});
