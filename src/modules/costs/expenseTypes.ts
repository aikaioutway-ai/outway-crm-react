export type ExpenseCategory = 'school' | 'office' | 'logistics' | 'extra_trip' | 'personal';
export type ExpensePaymentMethod = 'cash' | 'cashless';

export interface ExpenseRecord {
  id: string;
  name: string;
  category: ExpenseCategory;
  subcategory: string;
  unitPrice: number;
  quantity: number;
  amount: number;
  expenseDate: string;
  paymentMethod: ExpensePaymentMethod;
  comment: string;
  createdBy?: string;
  createdAt: string;
}

export interface NewExpenseRecord {
  name: string;
  category: ExpenseCategory;
  subcategory: string;
  unitPrice: number;
  quantity: number;
  expenseDate: string;
  paymentMethod: ExpensePaymentMethod;
  comment: string;
  createdBy?: string;
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, { label: string; color: string; soft: string; subcategories: string[] }> = {
  school: {
    label: 'Школа', color: '#258B8C', soft: '#E2F5F3',
    subcategories: ['Зарплата (+авансы)', 'Промоматериалы', 'Премия', 'Подарки', 'Фонд Школы', 'Возврат', 'Прочее'],
  },
  office: {
    label: 'Офис', color: '#5267A8', soft: '#EDF0FA',
    subcategories: ['Аренда', 'Коммунальные услуги', 'Канцтовары', 'Зарплата', 'Премия', 'Подарки', 'Налог', 'Соцфонд', 'Связь и интернет', 'Прочее'],
  },
  logistics: {
    label: 'Логистика', color: '#D17B2C', soft: '#FFF1E4',
    subcategories: ['Возврат', 'Оплата водителю', 'Прочее'],
  },
  extra_trip: {
    label: 'Доп. выезды', color: '#7B61A8', soft: '#F3EDFA',
    subcategories: ['Оплата водителю', 'Возврат', 'Прочее'],
  },
  personal: {
    label: 'Личное', color: '#B75B75', soft: '#FBEAF0',
    subcategories: [
      'Квартплата',
      'Кредит',
      'Лекарство',
      'ГСМ',
      'Продукты',
      'Вещи',
      'Учёба',
      'Мероприятия',
      'Развлечения',
      'Транспорт и такси',
      'Связь и интернет',
      'Коммунальные услуги',
      'Здоровье',
      'Ремонт',
      'Путешествия',
      'Прочее',
    ],
  },
};

export const EXPENSE_CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];
