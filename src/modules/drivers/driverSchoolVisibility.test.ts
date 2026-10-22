import { driverMatchesSchool, isVisibleDriver } from './driverSchoolVisibility';
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
test('drivers of schools whose branch code differs from the tab key match their school tab',()=>{
  const driver=(code:string,short:string)=>({...hidden,branchCodes:[code],branchShorts:[short],branchNames:[],transfers:[{branchShort:short,branchCode:code}]} as unknown as V2DriverTableRow);
  expect(driverMatchesSchool(driver('SANARIP','SNP'),'SNP')).toBe(true);
  expect(driverMatchesSchool(driver('ELLIPSE','ELP'),'ELS')).toBe(true);
  expect(driverMatchesSchool(driver('ABL2','ABL #1'),'ABL2')).toBe(true);
  expect(driverMatchesSchool(driver('ING_A','ING_A'),'ING')).toBe(false);
});
