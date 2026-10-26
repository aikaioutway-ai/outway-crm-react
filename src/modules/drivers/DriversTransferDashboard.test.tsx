import { render, screen } from '@testing-library/react';
import DriversTransferDashboard from './DriversTransferDashboard';

jest.mock('../../hooks/useCrmQueries',()=>({
  useSchoolTransferNumbers:()=>[1,2],
  useDriversTable:()=>({data:[
    {driverId:'temporary',fullName:'Временный водитель №104',status:'active',transferNumbers:'1',transferCount:1,vehicleType:'minivan',branchShorts:['TIS'],branchCodes:['TENSAY'],transfers:[{id:'t1',transferNumber:1,branchShort:'TIS',branchCode:'TENSAY'}]},
    {driverId:'regular',fullName:'Действующий водитель',status:'active',transferNumbers:'2',transferCount:1,vehicleType:'minivan',branchShorts:['TIS'],branchCodes:['TENSAY'],transfers:[{id:'t2',transferNumber:2,branchShort:'TIS',branchCode:'TENSAY'}]},
  ]}),
}));
test('marks only the transfer with a numbered temporary driver in red',()=>{
  render(<DriversTransferDashboard schoolKey="TIS"/>);
  const temporary=screen.getByTitle(/Временный водитель/);
  expect(temporary).toHaveClass('is-alert');
  expect(temporary.style.getPropertyValue('--cell-color')).toBe('#DC2626');
  expect(screen.getAllByTitle(/Водителей: 1/).filter(button=>button!==temporary)[0]).not.toHaveClass('is-alert');
});
