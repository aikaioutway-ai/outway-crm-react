import { getBranchFilter,isSchoolAllowed,isSchoolVisible,SCHOOL_TABS } from './constants';
test('school 2.0 is absent from the shared catalog and cannot be revealed by ALL permissions',()=>{
  for(const key of ['BJ','LA_P','ING_W']){
    expect(SCHOOL_TABS.some(school=>school.key===key)).toBe(false);
    expect(isSchoolAllowed(key)).toBe(false);
    expect(isSchoolAllowed(key,['ALL',key])).toBe(false);
  }
  expect(isSchoolAllowed('TIS',['ALL'])).toBe(true);
});
test('hidden branch labels remain mapped correctly without being visible school options',()=>{
  expect(isSchoolVisible('LA Primary')).toBe(false);
  expect(isSchoolVisible('LIGHT_PRIMARY')).toBe(false);
  expect(isSchoolVisible('Indigo West')).toBe(false);
  expect(getBranchFilter('Билим Жолу','BILIM')).toBe('BJ');
  expect(getBranchFilter('Light Academy Primary','LIGHT')).toBe('LA_P');
  expect(getBranchFilter('Light Academy','LIGHT')).toBe('LA');
});
