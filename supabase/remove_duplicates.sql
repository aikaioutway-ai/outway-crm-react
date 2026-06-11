-- ============================================================
-- OutWay CRM — Удаление дублей
-- Запускать в Supabase SQL Editor по одному блоку
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- ШАГ 1. СНАЧАЛА СМОТРИМ — не удаляем
-- ═══════════════════════════════════════════════════════════

-- Дубли families (один родитель + школа встречается 2+ раз)
SELECT
  phone, school_code,
  COUNT(*) AS cnt,
  array_agg(id ORDER BY created_at) AS ids
FROM families
GROUP BY phone, school_code
HAVING COUNT(*) > 1;

-- Дубли children (один ребёнок в семье 2+ раз)
-- ВАЖНО: разные дети одной семьи — НЕ дубли, это нормально
SELECT
  family_id, child_name,
  COUNT(*) AS cnt,
  array_agg(id ORDER BY id) AS ids
FROM children
GROUP BY family_id, child_name
HAVING COUNT(*) > 1;

-- Дубли payments (один период у семьи 2+ раз)
SELECT
  family_id, period_key,
  COUNT(*) AS cnt,
  array_agg(id ORDER BY id) AS ids
FROM payments
GROUP BY family_id, period_key
HAVING COUNT(*) > 1;


-- ═══════════════════════════════════════════════════════════
-- ШАГ 2. УДАЛЯЕМ (только после того как проверили выше)
-- ═══════════════════════════════════════════════════════════

-- Дубли families: оставляем самую раннюю запись
-- Детей и платежи удалённых дублей тоже нужно перевязать (см. ниже)
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY phone, school_code
      ORDER BY created_at ASC
    ) AS rn
  FROM families
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1
)
-- Сначала переносим детей и платежи на "главную" семью
UPDATE children
SET family_id = (
  SELECT MIN(f2.id)
  FROM families f2
  WHERE f2.phone = (SELECT phone FROM families WHERE id = children.family_id)
    AND f2.school_code = (SELECT school_code FROM families WHERE id = children.family_id)
)
WHERE family_id IN (SELECT id FROM to_delete);

UPDATE payments
SET family_id = (
  SELECT MIN(f2.id)
  FROM families f2
  WHERE f2.phone = (SELECT phone FROM families WHERE id = payments.family_id)
    AND f2.school_code = (SELECT school_code FROM families WHERE id = payments.family_id)
)
WHERE family_id IN (SELECT id FROM to_delete);

-- Теперь удаляем дубли-семьи
DELETE FROM families
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY phone, school_code
        ORDER BY created_at ASC
      ) AS rn
    FROM families
  ) t WHERE rn > 1
);

-- Дубли children (одинаковое имя в одной семье — точные дубли)
DELETE FROM children
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY family_id, child_name
        ORDER BY id ASC
      ) AS rn
    FROM children
  ) t WHERE rn > 1
);

-- Дубли payments: оставляем с лучшим статусом
DELETE FROM payments
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY family_id, period_key
        ORDER BY
          CASE accountant_status
            WHEN 'Оплачено'           THEN 1
            WHEN 'Частично оплачено'  THEN 2
            WHEN 'На проверке (чек)'  THEN 3
            WHEN 'На проверке'        THEN 4
            WHEN 'Просрочено'         THEN 5
            WHEN 'Не оплачено'        THEN 6
            ELSE 7
          END ASC
      ) AS rn
    FROM payments
  ) t WHERE rn > 1
);


-- ═══════════════════════════════════════════════════════════
-- ШАГ 3. ДОБАВЛЯЕМ УНИКАЛЬНЫЕ ИНДЕКСЫ (защита на будущее)
-- ═══════════════════════════════════════════════════════════

-- Один родитель = одна семья в одной школе
ALTER TABLE families
  ADD CONSTRAINT uq_families_phone_school
  UNIQUE (phone, school_code);

-- Один ребёнок (по имени) в одной семье
ALTER TABLE children
  ADD CONSTRAINT uq_children_family_name
  UNIQUE (family_id, child_name);

-- Один период на семью
ALTER TABLE payments
  ADD CONSTRAINT uq_payments_family_period
  UNIQUE (family_id, period_key);

-- ═══════════════════════════════════════════════════════════
-- Готово. Проверить что всё чисто:
-- ═══════════════════════════════════════════════════════════
SELECT 'families' AS tbl, COUNT(*) FROM families
UNION ALL
SELECT 'children', COUNT(*) FROM children
UNION ALL
SELECT 'payments', COUNT(*) FROM payments;
