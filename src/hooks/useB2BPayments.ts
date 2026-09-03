import { useQuery } from '@tanstack/react-query';
import { fetchB2BPayments } from '../services/b2bDataService';
import { B2B_QUERY_KEYS } from './useB2BData';
import { B2BPaymentRecord } from '../services/b2bPaymentService';

export default function useB2BPayments(): B2BPaymentRecord[] {
  const { data = [] } = useQuery<B2BPaymentRecord[]>({ queryKey: B2B_QUERY_KEYS.payments, queryFn: fetchB2BPayments });
  return data;
}
