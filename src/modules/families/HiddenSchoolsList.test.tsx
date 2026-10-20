import { render } from '@testing-library/react';
import HiddenSchoolsList from './HiddenSchoolsList';
test.each([undefined,['ALL'],['BJ','LA_P','ING_W'],['TIS']])('schools 2.0 cannot be opened through the hidden-schools menu (%s)',allowedSchools=>{
  const {container}=render(<HiddenSchoolsList onSelectSchool={jest.fn()} allowedSchools={allowedSchools}/>);
  expect(container).toBeEmptyDOMElement();
});
