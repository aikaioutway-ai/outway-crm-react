-- Синхронизирует ограничение ролей с интерфейсом сотрудников и Edge Functions.
-- Без этого v2_employees отклоняет gen_director до того, как пользователь
-- сможет получить подписанную сессию для expense-api.
alter table public.v2_employees
  drop constraint if exists v2_employees_role_check;

alter table public.v2_employees
  add constraint v2_employees_role_check
  check (
    role in (
      'admin',
      'gen_director',
      'director',
      'manager',
      'senior_logist',
      'logist',
      'cashier',
      'driver'
    )
  );
