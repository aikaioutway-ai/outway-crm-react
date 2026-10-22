import { V2DriverTableRow } from '../../services/crmV2Service';
import { getBranchFilter, isSchoolVisible, SCHOOL_DIRECTORY } from '../families/constants';
export function isVisibleDriver(driver:V2DriverTableRow):boolean {
  if(driver.transfers.length)return driver.transfers.some(transfer=>isSchoolVisible(transfer.branchShort) && isSchoolVisible(getBranchFilter(transfer.branchShort,transfer.branchCode)));
  const schools=[...driver.branchShorts,...driver.branchNames].filter(Boolean);
  return !schools.length || schools.some(isSchoolVisible);
}
// Школа водителя определяется по школам его трансферов. Код филиала в БД
// (например SANARIP) не всегда совпадает с ключом вкладки (SNP), поэтому
// дополнительно сверяем его с кодами школы из справочника.
export function driverMatchesSchool(driver:V2DriverTableRow, schoolKey:string):boolean {
  const school=SCHOOL_DIRECTORY.find(item=>item.key===schoolKey);
  if(!school)return false;
  return driver.branchCodes.includes(school.key)
    || driver.branchShorts.includes(school.label)
    || driver.branchNames.includes(school.label)
    || driver.branchCodes.some(code=>school.codes.includes(code.toUpperCase()));
}
