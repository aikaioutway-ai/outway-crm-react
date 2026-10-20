import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DriverPaymentsPanel from './DriverPaymentsPanel';
import { fetchDriverPayments } from '../../services/expenseService';
jest.mock('../../services/expenseService',()=>({fetchDriverPayments:jest.fn()}));
jest.mock('../../services/crmV2Service',()=>({deleteV2DriverAdvance:jest.fn()}));
const rows=[{id:'salary-1',sourceId:'1',kind:'salary',date:'2026-10-20',periodKey:'2026-10-1',amount:700,paymentMethod:'cash',comment:''},{id:'advance-2',sourceId:'2',kind:'advance',date:'2026-10-19',periodKey:'2026-10-2',amount:300,paymentMethod:'cashless',comment:''}];
function show(view:'finance'|'history') {const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><DriverPaymentsPanel driverId="selected-driver" sessionToken="session" view={view}/></QueryClientProvider>);}
beforeEach(()=>jest.clearAllMocks());
test('finance reads the selected driver and shows actual monthly payment totals',async()=>{
  (fetchDriverPayments as jest.Mock).mockResolvedValue(rows);show('finance');
  await screen.findAllByText('700 сом');
  expect(fetchDriverPayments).toHaveBeenCalledWith('selected-driver','session');
  expect(screen.getAllByText(/1\s000 сом/).length).toBeGreaterThan(0);
  expect(screen.getAllByText('300 сом').length).toBeGreaterThan(0);
});
test('history shows salary and advance with their own half-month periods',async()=>{
  (fetchDriverPayments as jest.Mock).mockResolvedValue(rows);show('history');
  await screen.findByText('Зарплата');
  expect(screen.getByText('Аванс')).toBeInTheDocument();
  expect(screen.getByText(/1–15/)).toBeInTheDocument();
  expect(screen.getByText(/16–31/)).toBeInTheDocument();
});
test('a backend failure is visible instead of a misleading zero balance',async()=>{
  (fetchDriverPayments as jest.Mock).mockRejectedValue(new Error('История недоступна'));show('finance');
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('История недоступна'));
  expect(screen.queryByText('0 сом')).not.toBeInTheDocument();
});
