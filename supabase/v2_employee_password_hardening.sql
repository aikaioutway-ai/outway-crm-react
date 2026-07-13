-- OutWay CRM — устраняем хранение и раздачу пароля сотрудника открытым текстом
-- Запустить в Supabase SQL Editor, затем задеплоить edge-функцию employee-login:
--   supabase functions deploy employee-login --no-verify-jwt
--   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
--
-- До этой миграции: v2_employees.password_plain хранил пароль открытым текстом
-- и отдавался клиенту при любом select('*') (страница «Сотрудники», логин) —
-- то есть уходил в браузер и был виден в devtools. Плюс в коде был захардкожен
-- обходной вход emp-admin/admin. После миграции пароль сверяется только внутри
-- серверной edge-функции employee-login (service-role ключ, не публичный).

-- 1. Для сотрудников, у кого пароль хранился только открытым текстом
--    (password_hash ещё не был посчитан) — досчитываем hash, чтобы никто
--    не потерял доступ.
update public.v2_employees
set password_hash = encode(digest(password_plain, 'sha256'), 'hex')
where password_hash is null and password_plain is not null;

-- 2. Раньше вход под emp-admin без единого сохранённого пароля разрешался
--    захардкоженным в коде бэкдором admin/admin. Теперь это обычный, реально
--    сохранённый (слабый) пароль — смените его в CRM сразу после миграции.
update public.v2_employees
set password_hash = encode(digest('admin', 'sha256'), 'hex')
where id = 'emp-admin' and password_hash is null and password_plain is null;

-- 3. Открытый текст больше не хранится нигде в базе.
alter table public.v2_employees drop column if exists password_plain;

-- 4. Даже с publishable (anon) ключом хеш пароля теперь нельзя прочитать через
--    REST API — читать может только service-role (edge-функция employee-login).
--    Записывать (задать новый пароль из формы сотрудника) по-прежнему можно.
revoke select (password_hash) on public.v2_employees from anon, authenticated;
