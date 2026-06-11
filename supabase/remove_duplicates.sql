-- ============================================================
-- OutWay CRM — Удаление дублей из всех таблиц
-- Запускать в Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ─── 1. ПОСМОТРЕТЬ дубли families (проверка перед удалением) ──────────────
SELECT
  phone,
  school_code,
  COUNT(*) AS cnt,
  array_agg(id ORDER BY created_at) AS ids
FROM families
GROUP BY phone, school_code
HAVING COUNT(*) > 1;

-- ─── 1b. УДАЛИТЬ дубли families ───────────────────────────────────────────
-- Оставляем САМУЮ РАННЮЮ запись (min id по created_at), остальные удаляем
DELETE FROM families
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY phone, school_code
        ORDER BY created_at ASC
      ) AS rn
    FROM families
  ) t
  WHERE rn > 1
);

-- ─── 2. ПОСМОТРЕТЬ дубли children ─────────────────────────────────────────
SELECT
  family_id,
  child_name,
  COUNT(*) AS cnt,
  array_agg(id ORDER BY id) AS ids
FROM children
GROUP BY family_id, child_name
HAVING COUNT(*) > 1;

-- ─── 2b. УДАЛИТЬ дубли children ───────────────────────────────────────────
DELETE FROM children
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY family_id, child_name
        ORDER BY id ASC
      ) AS rn
    FROM children
  ) t
  WHERE rn > 1
);

-- ─── 3. ПОСМОТРЕТЬ дубли payments ─────────────────────────────────────────
SELECT
  family_id,
  period_key,
  COUNT(*) AS cnt,
  array_agg(id ORDER BY id) AS ids
FROM payments
GROUP BY family_id, period_key
HAVING COUNT(*) > 1;

-- ─── 3b. УДАЛИТЬ дубли payments ───────────────────────────────────────────
-- Оставляем ту запись у которой статус лучше (оплачено > на проверке > не оплачено)
DELETE FROM payments
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY family_id, period_key
        ORDER BY
          CASE accountant_status
            WHEN 'Оплачено'             THEN 1
            WHEN 'Частично оплачено'    THEN 2
            WHEN 'На проверке (чек)'    THEN 3
            WHEN 'На проверке'          THEN 4
            WHEN 'Просрочено'           THEN 5
            WHEN 'Не оплачено'          THEN 6
            ELSE 7
          END ASC
      ) AS rn
    FROM payments
  ) t
  WHERE rn > 1
);

-- ─── 4. ДОБАВИТЬ УНИКАЛЬНЫЕ ИНДЕКСЫ чтобы дубли больше не появлялись ──────

-- families: один родитель + одна школа
ALTER TABLE families
  ADD CONSTRAINT uq_families_phone_school
  UNIQUE (phone, school_code);

-- children: один ребёнок в семье
ALTER TABLE children
  ADD CONSTRAINT uq_children_family_name
  UNIQUE (family_id, child_name);

-- payments: один период на семью
ALTER TABLE payments
  ADD CONSTRAINT uq_payments_family_period
  UNIQUE (family_id, period_key);

-- ─── ГОТОВО ───────────────────────────────────────────────────────────────
-- После выполнения проверьте в Table Editor что данные корректны.
