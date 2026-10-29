import { setCrmActor } from '../../services/crmActor';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TabFinance from './TabFinance';

jest.mock('./ReceiptModal', () => ({
  __esModule: true,
  isPdfReceipt: (url: string) => /\.pdf(?:[?#]|$)/i.test(url),
  default: ({ receiptUrl, pdf, paymentId, onClose }: { receiptUrl: string; pdf: boolean; paymentId?: string; onClose: () => void }) => (
    <div role="dialog" aria-label="Окно чека" data-url={receiptUrl} data-pdf={String(pdf)} data-payment={paymentId ?? ''}>
      <button type="button" onClick={onClose}>Закрыть просмотр чека</button>
    </div>
  ),
}));

const props: React.ComponentProps<typeof TabFinance> = {
  charges: [], payments: [], paymentItems: [], refunds: [], children: [], loading: false,
  family: {} as React.ComponentProps<typeof TabFinance>['family'],
  isAdmin: true, isCashier: false, isManager: false,
  onSaveCharge: jest.fn(), onDeleteCharge: jest.fn(), onAddCharges: jest.fn(),
  onCreatePayment: jest.fn(), onConfirmPayment: jest.fn(), onSavePayment: jest.fn(),
  onDeletePayment: jest.fn(), onCreateRefund: jest.fn(), onConfirmRefund: jest.fn(), onRejectRefund: jest.fn(),
};

test('keeps charges separate and shows receipts without a new refund form', () => {
  const { rerender } = render(<TabFinance {...props} mode="charges" />);
  expect(screen.getByText('Начисления по периодам')).toBeInTheDocument();
  expect(screen.queryByText('Новый платёж')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Сумма возврата')).not.toBeInTheDocument();

  rerender(<TabFinance {...props} mode="payments" />);
  expect(screen.getByText('Новый платёж')).toBeInTheDocument();
  expect(screen.getByText('Прикрепить чек')).toBeInTheDocument();
  expect(screen.queryByText('Начисления по периодам')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Сумма возврата')).not.toBeInTheDocument();
  expect(screen.getByText('Платежи (0)')).toBeInTheDocument();
  expect(screen.queryByText('Чеки (0)')).not.toBeInTheDocument();

  rerender(<TabFinance {...props} mode="refunds" />);
  expect(screen.queryByPlaceholderText('Сумма возврата')).not.toBeInTheDocument();
  expect(screen.getByText('Платежи (0)')).toBeInTheDocument();
  expect(screen.queryByText('Чеки (0)')).not.toBeInTheDocument();
  expect(screen.getByText('Новый платёж')).toBeInTheDocument();
  expect(screen.queryByText('Начисления по периодам')).not.toBeInTheDocument();
});

test.each(['https://example.com/receipt.jpg','https://example.com/receipt.pdf'])('opens saved receipt in the receipt window without clearing the form: %s',url=>{
 render(<TabFinance {...props} mode="payments" payments={[{id:'payment',amount:5500,paymentType:'transfer',status:'На проверке',paymentDate:'2026-10-21',receiptUrl:url} as React.ComponentProps<typeof TabFinance>['payments'][number]]}/>);
 const amount=screen.getByPlaceholderText('Сумма');
 fireEvent.change(amount,{target:{value:'6800'}});
 fireEvent.click(screen.getByRole('button',{name:'Чек'}));
 const dialog=screen.getByRole('dialog',{name:'Окно чека'});
 expect(dialog).toHaveAttribute('data-url',url);
 expect(dialog).toHaveAttribute('data-pdf',String(url.endsWith('.pdf')));
 expect(dialog).toHaveAttribute('data-payment','payment');
 fireEvent.click(screen.getByRole('button',{name:'Закрыть просмотр чека'}));
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 expect(amount).toHaveValue(6800);
});

test('duplicate message identifies the original family and keeps the entered payment',async()=>{
 const onCreatePayment=jest.fn().mockRejectedValue(new Error('Дубль чека: семья Перминов Александр (FAM-000249), 6800 сом'));
 render(<TabFinance {...props} mode="payments" onCreatePayment={onCreatePayment}/>);
 const amount=screen.getByRole('spinbutton',{name:'Сумма платежа'});
 fireEvent.change(amount,{target:{value:'6800'}});
 fireEvent.click(screen.getByRole('button',{name:'На проверку →'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('FAM-000249');
 expect(amount).toHaveValue(6800);
 expect(screen.queryByText('Платёж отправлен кассиру на проверку')).not.toBeInTheDocument();
});

test('combines refunds and saved client expenses and excludes other families', () => {
  setCrmActor('owner');
  localStorage.setItem('outway-spending-v1:owner', JSON.stringify([
    { id: 'e1', familyId: 'family1', category: 'OPEX', subcategory: 'Возмещение такси родителю', amount: 500, date: '2026-10-29', childName: 'Ребёнок' },
    { id: 'e2', familyId: 'other', category: 'OPEX', subcategory: 'Чужой расход', amount: 100, date: '2026-10-29' },
  ]));
  try {
    render(<TabFinance {...props} mode="payments" family={{ ...props.family, id: 'family1' }} refunds={[{ id: 'r1', familyId: 'family1', amount: 200, status: 'Подтверждено', requestedAt: '2026-10-28' } as React.ComponentProps<typeof TabFinance>['refunds'][number]]} />);
    expect(screen.getByText('Расходы на клиента (2)')).toBeInTheDocument();
    expect(screen.getByText('Возмещение такси родителю')).toBeInTheDocument();
    expect(screen.getByText('Возврат')).toBeInTheDocument();
    expect(screen.queryByText('Чужой расход')).not.toBeInTheDocument();
  } finally { setCrmActor(null); localStorage.removeItem('outway-spending-v1:owner'); }
});
