import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import TabFinance from './TabFinance';

const props: React.ComponentProps<typeof TabFinance> = {
  charges: [], payments: [], paymentItems: [], refunds: [], children: [], loading: false,
  family: {} as React.ComponentProps<typeof TabFinance>['family'],
  isAdmin: true, isCashier: false, isManager: false,
  onSaveCharge: jest.fn(), onDeleteCharge: jest.fn(), onAddCharges: jest.fn(),
  onCreatePayment: jest.fn(), onConfirmPayment: jest.fn(), onSavePayment: jest.fn(),
  onDeletePayment: jest.fn(), onCreateRefund: jest.fn(), onConfirmRefund: jest.fn(), onRejectRefund: jest.fn(),
};

test('keeps charges separate and combines payment and refund forms', () => {
  const { rerender } = render(<TabFinance {...props} mode="charges" />);
  expect(screen.getByText('Начисления по периодам')).toBeInTheDocument();
  expect(screen.queryByText('Новый платёж')).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Сумма возврата')).not.toBeInTheDocument();

  rerender(<TabFinance {...props} mode="payments" />);
  expect(screen.getByText('Новый платёж')).toBeInTheDocument();
  expect(screen.getByText('Прикрепить чек')).toBeInTheDocument();
  expect(screen.queryByText('Начисления по периодам')).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText('Сумма возврата')).toBeInTheDocument();

  rerender(<TabFinance {...props} mode="refunds" />);
  expect(screen.getByPlaceholderText('Сумма возврата')).toBeInTheDocument();
  expect(screen.getByText('Новый платёж')).toBeInTheDocument();
  expect(screen.queryByText('Начисления по периодам')).not.toBeInTheDocument();
});

test.each(['https://example.com/receipt.jpg','https://example.com/receipt.pdf'])('opens saved receipt beside editable form: %s',url=>{
 render(<TabFinance {...props} mode="payments" payments={[{id:'payment',amount:5500,paymentType:'transfer',status:'На проверке',paymentDate:'2026-10-21',receiptUrl:url} as React.ComponentProps<typeof TabFinance>['payments'][number]]}/>);
 const amount=screen.getByPlaceholderText('Сумма');
 fireEvent.change(amount,{target:{value:'6800'}});
 fireEvent.click(screen.getByRole('button',{name:'Чек'}));
 expect(screen.getByRole('complementary',{name:'Просмотр чека рядом'})).toBeInTheDocument();
 if(url.endsWith('.pdf'))expect(screen.getByTitle('PDF чека')).toHaveAttribute('src',url);
 else expect(screen.getByAltText('Прикреплённый чек')).toHaveAttribute('src',url);
 expect(amount).toHaveValue(6800);
 expect(screen.queryByRole('link',{name:'Чек'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Закрыть просмотр чека'}));
 expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
 expect(amount).toHaveValue(6800);
});

test('a second receipt replaces the first in the same preview without clearing the form',()=>{
 const payments=['first.pdf','second.pdf'].map((file,index)=>({id:String(index),amount:5500,paymentType:'transfer',status:'На проверке',paymentDate:'2026-10-21',receiptUrl:`https://example.com/${file}`} as React.ComponentProps<typeof TabFinance>['payments'][number]));
 render(<TabFinance {...props} mode="payments" payments={payments}/>);
 const amount=screen.getByRole('spinbutton',{name:'Сумма платежа'});
 fireEvent.change(amount,{target:{value:'6800'}});
 fireEvent.click(screen.getAllByRole('button',{name:'Чек'})[0]);
 expect(screen.getByTitle('PDF чека')).toHaveAttribute('src',payments[0].receiptUrl);
 fireEvent.click(screen.getAllByRole('button',{name:'Чек'})[1]);
 expect(screen.getAllByRole('complementary')).toHaveLength(1);
 expect(screen.getByTitle('PDF чека')).toHaveAttribute('src',payments[1].receiptUrl);
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
