-- Код вида QR_/MBIZ_S_ считается уникальным только если в нём есть настоящий номер операции (8+ цифр).
-- Иначе распознавание выдумывает «коды» вроде QR_OsOO_AiKai_Group (из названия получателя) или
-- обрезает код до QR_452, и все такие чеки ложно считаются дублями друг друга.
-- Откат: вернуть определение из 20261021093327_receipt_duplicate_guard.sql и снова выполнить REINDEX.

create or replace function public.receipt_unique_key(code text, bank text default null)
returns text language sql immutable set search_path=public as $$
 select case
 when code ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then lower(substring(code from '(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'))
 when trim(code) ~* '^(MBIZ_S_|QR_)[a-z0-9_-]+$' and length(regexp_replace(code,'[^0-9]','','g')) >= 8 then lower(trim(code))
 when trim(code) ~ '^[0-9]{6,}$' and nullif(trim(bank),'') is not null then lower(regexp_replace(bank,'[^a-zA-Zа-яА-Я0-9]','','g')) || ':' || trim(code)
 else null end
$$;

-- Индекс построен на результате этой функции — после смены правила его нужно пересобрать.
reindex index public.v2_receipt_code_lookup;
