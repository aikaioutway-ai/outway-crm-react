import { V2DriverTableRow } from '../../services/crmV2Service';
import { getBranchFilter, isSchoolVisible } from '../families/constants';
export function isVisibleDriver(driver:V2DriverTableRow):boolean {
  if(driver.transfers.length)return driver.transfers.some(transfer=>isSchoolVisible(transfer.branchShort) && isSchoolVisible(getBranchFilter(transfer.branchShort,transfer.branchCode)));
  const schools=[...driver.branchShorts,...driver.branchNames].filter(Boolean);
  return !schools.length || schools.some(isSchoolVisible);
}
