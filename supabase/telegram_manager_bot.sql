-- Telegram manager bot for parent groups.
-- Run this migration as the database owner before deploying the Edge Function.

create extension if not exists pgcrypto;

create table if not exists public.v2_telegram_groups (
  chat_id bigint primary key,
  title text not null,
  branch_id uuid references public.v2_school_branches(id) on delete set null,
  enabled boolean not null default true,
  response_mode text not null default 'mention'
    check (response_mode in ('mention', 'question', 'all')),
  manager_chat_id bigint,
  registered_by bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_bot_knowledge (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.v2_school_branches(id) on delete cascade,
  topic text not null,
  question text not null,
  answer text not null,
  keywords text[] not null default '{}',
  source text not null default 'manual',
  source_ref text,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.v2_bot_knowledge add column if not exists source text not null default 'manual';
alter table public.v2_bot_knowledge add column if not exists source_ref text;

create table if not exists public.v2_bot_messages (
  id uuid primary key default gen_random_uuid(),
  update_id bigint not null unique,
  chat_id bigint not null,
  message_id bigint,
  telegram_user_id bigint,
  telegram_username text,
  parent_name text,
  question text not null,
  answer text,
  status text not null default 'received'
    check (status in ('received', 'answered', 'handoff', 'ignored', 'error')),
  confidence numeric(4,3),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.v2_bot_handoffs (
  id uuid primary key default gen_random_uuid(),
  bot_message_id uuid not null references public.v2_bot_messages(id) on delete cascade,
  chat_id bigint not null,
  manager_chat_id bigint,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'cancelled')),
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.v2_telegram_users (
  telegram_user_id bigint primary key,
  telegram_username text,
  phone_normalized text,
  family_id text references public.v2_families(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v2_bot_knowledge_branch_active
  on public.v2_bot_knowledge(branch_id, active, priority);
create index if not exists idx_v2_bot_messages_chat_created
  on public.v2_bot_messages(chat_id, created_at desc);
create index if not exists idx_v2_bot_handoffs_status_created
  on public.v2_bot_handoffs(status, created_at desc);
create index if not exists idx_v2_telegram_users_family
  on public.v2_telegram_users(family_id);

create or replace function public.v2_bot_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_v2_telegram_groups_updated_at on public.v2_telegram_groups;
create trigger trg_v2_telegram_groups_updated_at
before update on public.v2_telegram_groups
for each row execute function public.v2_bot_touch_updated_at();

drop trigger if exists trg_v2_bot_knowledge_updated_at on public.v2_bot_knowledge;
create trigger trg_v2_bot_knowledge_updated_at
before update on public.v2_bot_knowledge
for each row execute function public.v2_bot_touch_updated_at();

drop trigger if exists trg_v2_telegram_users_updated_at on public.v2_telegram_users;
create trigger trg_v2_telegram_users_updated_at
before update on public.v2_telegram_users
for each row execute function public.v2_bot_touch_updated_at();

alter table public.v2_telegram_groups enable row level security;
alter table public.v2_bot_knowledge enable row level security;
alter table public.v2_bot_messages enable row level security;
alter table public.v2_bot_handoffs enable row level security;
alter table public.v2_telegram_users enable row level security;

-- No anon/authenticated policies are intentional. The bot uses service_role.
revoke all on public.v2_telegram_groups from anon, authenticated;
revoke all on public.v2_bot_knowledge from anon, authenticated;
revoke all on public.v2_bot_messages from anon, authenticated;
revoke all on public.v2_bot_handoffs from anon, authenticated;
revoke all on public.v2_telegram_users from anon, authenticated;

-- Safe starter answers. Replace or extend these after the manager approves wording.
insert into public.v2_bot_knowledge (topic, question, answer, keywords, priority)
select *
from (values
  (
    'contact',
    'Как связаться с менеджером?',
    'Напишите ваш вопрос в этой группе и отметьте бота. Если нужен доступ к личным данным или изменение маршрута, бот передаст вопрос живому менеджеру.',
    array['менеджер', 'связаться', 'оператор', 'человек'],
    10
  ),
  (
    'privacy',
    'Можно ли узнать баланс или данные ребёнка в группе?',
    'Нет. В общей группе мы не публикуем баланс, адреса, телефоны, данные ребёнка и другую личную информацию. Такие вопросы менеджер решает только в личном канале после проверки личности.',
    array['баланс', 'адрес', 'телефон', 'личные данные', 'ребёнок'],
    10
  ),
  (
    'payments',
    'Куда отправить чек об оплате?',
    'Не отправляйте банковский чек в общую родительскую группу: на нём могут быть личные данные. Передайте чек менеджеру в согласованный личный канал.',
    array['чек', 'оплата', 'платёж', 'квитанция'],
    20
  )
) as seed(topic, question, answer, keywords, priority)
where not exists (
  select 1
  from public.v2_bot_knowledge existing
  where existing.branch_id is null and existing.topic = seed.topic
);

-- Parent contract rules. School-specific tariff tables are intentionally omitted:
-- the bot reads active prices from v2_tariffs at answer time.
insert into public.v2_bot_knowledge
  (topic, question, answer, keywords, source, source_ref, priority)
select *
from (values
  ('contract_service_period', 'На какой период заключается договор?', 'Сервис на 2026–2027 учебный год организуется в учебные дни со 2 сентября 2026 года по 30 мая 2027 года, кроме официальных праздников и каникул.', array['срок договора', 'учебный год', 'когда начинается', 'когда заканчивается'], 'parent_contract_2026_2027', 'п. 2.1, 10.1', 40),
  ('contract_driver_notice', 'Когда сообщат данные водителя и машины?', 'ФИО, телефон и лицензионные данные водителя, а также сведения о транспортном средстве сообщаются через мессенджер не позднее чем за один рабочий день до первого трансфера. При замене водителя направляется новое уведомление.', array['данные водителя', 'телефон водителя', 'машина', 'госномер', 'замена водителя'], 'parent_contract_2026_2027', 'п. 2.3, 4.5', 40),
  ('contract_payment_deadline', 'До какого числа нужно оплачивать трансфер?', 'Ежемесячный платёж вносится до 5-го числа текущего месяца.', array['срок оплаты', 'до какого числа', 'оплатить', 'платёж'], 'parent_contract_2026_2027', 'п. 3.5', 40),
  ('contract_late_payment', 'Что происходит при просрочке оплаты?', 'С 6-го числа начисляется пеня 100 сом за каждый календарный день просрочки, но не более 15% месячного долга. При просрочке более 10 календарных дней сервис может быть приостановлен; персональную ситуацию нужно уточнить у менеджера.', array['просрочка', 'пеня', 'не оплатил', 'задолженность', 'приостановка'], 'parent_contract_2026_2027', 'п. 3.6–3.7', 40),
  ('contract_deposit', 'Как используется обеспечительный платёж?', 'Обеспечительный платёж равен одному месячному платежу и засчитывается за май учебного года. Условия его возврата при досрочном расторжении определяются разделом 10 договора.', array['депозит', 'обеспечительный платёж', 'май', 'последний месяц'], 'parent_contract_2026_2027', 'п. 3.4, 10.3–10.4', 40),
  ('contract_no_recalculation', 'В каких случаях перерасчёт не производится?', 'Платёж не уменьшается из-за каникул и официальных праздников, отсутствия ребёнка по личным причинам, пропусков в пределах 7 рабочих дней вне каникул, временного закрытия дорог и других обстоятельств, не зависящих от OutWay. Эти случаи учтены в годовом расчёте и резервных днях.', array['перерасчёт', 'болезнь', 'отпуск', 'пропуск', 'каникулы', 'закрытие дорог'], 'parent_contract_2026_2027', 'раздел 3А', 40),
  ('contract_route_confirmation', 'Когда подтвердят место и маршрут?', 'Если договор подписан с 1 июня по 15 августа, подтверждение направляется не позднее 30 августа; при подписании с 15 августа по 5 сентября — не позднее 15 сентября; после 10 сентября — в течение 10 рабочих дней.', array['подтверждение маршрута', 'подтвердят место', 'срок подтверждения', 'лист ожидания'], 'parent_contract_2026_2027', 'п. 3Б.1', 40),
  ('contract_no_route', 'Что будет, если места на маршруте не окажется?', 'OutWay предложит альтернативный маршрут или тип транспорта. На принятие решения даётся 3 рабочих дня. Если место и альтернатива отсутствуют, можно встать в лист ожидания или расторгнуть договор с полным возвратом средств.', array['нет места', 'нет маршрута', 'альтернативный маршрут', 'лист ожидания', 'возврат'], 'parent_contract_2026_2027', 'п. 3Б.1', 40),
  ('contract_stop_distance', 'Как далеко может находиться остановка?', 'Конкретная безопасная точка посадки и высадки определяется с учётом ПДД и дорожной обстановки в пределах 300 метров от места проживания ребёнка.', array['300 метров', 'далеко остановка', 'точка посадки', 'место проживания'], 'parent_contract_2026_2027', 'п. 4.1', 40),
  ('contract_time_deviation', 'Насколько может отклоняться время подачи транспорта?', 'Ориентировочное отклонение составляет плюс-минус 10 минут. Фактическое время зависит от пробок, погоды, перекрытий, ДТП и другой дорожной обстановки.', array['опоздание', 'время подачи', '10 минут', 'пробки', 'задержка'], 'parent_contract_2026_2027', 'п. 4.2', 40),
  ('contract_service_changes', 'Может ли измениться водитель, транспорт или расписание?', 'Да. OutWay гарантирует место в трансфере, но конкретный номер трансфера, водитель, маршрут, тип транспорта и точное время могут меняться. О плановых изменениях уведомляют за 3 рабочих дня, об экстренных — незамедлительно.', array['смена водителя', 'другой автобус', 'изменение маршрута', 'расписание', 'ротация'], 'parent_contract_2026_2027', 'раздел 4Б', 40),
  ('contract_wait_morning', 'Сколько водитель ждёт ребёнка утром?', 'Водитель ожидает не более 2 минут только при условии, что родитель заранее уведомил об опоздании. Без уведомления водитель не обязан ждать. После 5 зафиксированных опозданий в течение месяца водитель вправе не ожидать.', array['сколько ждёт', 'опоздали утром', '2 минуты', 'не дождался'], 'parent_contract_2026_2027', 'п. 5.1, 5.3', 40),
  ('contract_wait_evening', 'Что происходит, если родитель опаздывает встретить ребёнка вечером?', 'Водитель ожидает не более 2 минут. Если встречающий не появился, ребёнок продолжает поездку с водителем, а новое безопасное место встречи согласовывается отдельно. Водитель не обязан возвращаться к исходной точке.', array['опоздал встретить', 'вечером', 'не встретили', '2 минуты'], 'parent_contract_2026_2027', 'п. 5.2', 40),
  ('contract_absence_notice', 'Когда сообщать, что ребёнок не поедет?', 'Об отсутствии ребёнка нужно сообщить менеджеру не позднее чем за один час до утреннего трансфера. Если ребёнок добрался до школы самостоятельно, отдельно сообщите, нужен ли вечерний трансфер. Если забрали ребёнка из школы сами — уведомите менеджера незамедлительно.', array['не поедет', 'отсутствие', 'самостоятельно в школу', 'забрали из школы', 'уведомить'], 'parent_contract_2026_2027', 'п. 5.4–5.5, раздел 9Б', 40),
  ('contract_child_handoff', 'Кому водитель может передать ребёнка?', 'Ребёнок передаётся родителю или лицу, заранее указанному в приложении к договору. Передача другому лицу или самостоятельный выход допускаются только после письменного согласия родителя через менеджера.', array['кто забирает', 'передача ребёнка', 'другое лицо', 'самостоятельный выход'], 'parent_contract_2026_2027', 'п. 6.2–6.3, приложение №2', 40),
  ('contract_vehicle_safety', 'Какие меры безопасности предусмотрены в транспорте?', 'Транспорт оснащается знаком «Осторожно, дети», табличкой маршрута и работающим видеорегистратором. К работе допускаются лицензированные водители с непрерывным стажем не менее 4 лет и ОСГОП-страхованием.', array['безопасность', 'видеорегистратор', 'страхование', 'стаж водителя', 'ОСГОП'], 'parent_contract_2026_2027', 'п. 6.5–6.7', 40),
  ('contract_complaint', 'Куда обращаться с жалобой на водителя или сервис?', 'Все вопросы и претензии направляются менеджеру OutWay. Звонить или писать водителю во время движения запрещено по соображениям безопасности. Обращение рассматривается в течение 24 часов с ответом о принятом решении.', array['жалоба', 'претензия', 'грубость', 'водитель', 'обращение'], 'parent_contract_2026_2027', 'п. 7.1, 8.4, раздел 9А', 40),
  ('contract_behavior', 'Какие правила поведения действуют в транспорте?', 'Во время движения нельзя отвлекать водителя, вставать с места, использовать ненормативную лексику, устраивать конфликты и драки или причинять ущерб транспорту и имуществу других пассажиров.', array['правила поведения', 'драка', 'вставать', 'отвлекать водителя', 'ущерб'], 'parent_contract_2026_2027', 'п. 8.1–8.2', 40),
  ('contract_termination', 'Как расторгнуть договор по инициативе родителя?', 'Нужно письменно уведомить OutWay за 30 календарных дней. Депозит при таком расторжении не возвращается. При уведомлении менее чем за 30 дней дополнительно предусмотрен штраф 2 000 сом. Оформление расторжения выполняет живой менеджер.', array['расторгнуть договор', 'отказаться', '30 дней', 'штраф', 'не возвращается депозит'], 'parent_contract_2026_2027', 'п. 10.2–10.4', 40),
  ('contract_personal_data', 'Как OutWay использует персональные данные?', 'Данные родителя и ребёнка обрабатываются для исполнения договора и могут передаваться водителю или куратору только в объёме, необходимом для организации трансфера. В общей группе персональные данные не публикуются.', array['персональные данные', 'конфиденциальность', 'передача данных', 'видеозапись'], 'parent_contract_2026_2027', 'раздел 11', 40)
) as seed(topic, question, answer, keywords, source, source_ref, priority)
where not exists (
  select 1
  from public.v2_bot_knowledge existing
  where existing.branch_id is null and existing.topic = seed.topic
);

-- Public FAQ from the 2026-2027 parent application form.
insert into public.v2_bot_knowledge (topic, question, answer, keywords, priority)
select *
from (values
  ('faq_sibling_discount', 'Есть ли скидка для нескольких детей?', 'Да. На второго и каждого последующего ребёнка из одной семьи предоставляется скидка 5%.', array['скидка', 'несколько детей', 'второй ребёнок', 'братья', 'сёстры'], 30),
  ('faq_security_deposit', 'Что такое обеспечительный платёж?', 'При подписании договора заказчик единовременно вносит оплату за первый месяц и обеспечительный платёж за последний месяц.', array['обеспечительный платёж', 'депозит', 'последний месяц', 'договор'], 30),
  ('faq_holiday_price', 'Почему цена одинаковая в месяцы с каникулами?', 'Стоимость рассчитывается на весь учебный год и распределяется равномерно по месяцам. Каникулы, праздничные и резервные дни уже учтены в расчёте.', array['каникулы', 'праздники', 'цена', 'полный месяц'], 30),
  ('faq_late_start', 'Можно ли подключиться после начала учебного года?', 'Да. Стоимость первого месяца рассчитывается пропорционально оставшимся учебным дням.', array['после начала', 'середина месяца', 'подключиться', 'учебные дни'], 30),
  ('faq_price_change', 'Может ли измениться стоимость?', 'Стоимость может быть пересмотрена только при существенном изменении внешних факторов, влияющих на перевозки. Обо всех изменениях родителей уведомляют заранее.', array['изменение цены', 'подорожание', 'стоимость', 'тариф'], 30),
  ('faq_stop_selection', 'Как определяется остановка?', 'Остановку определяет логистический отдел OutWay с учётом безопасности маршрута и дорожной ситуации. Обычно она находится максимально близко к месту проживания ребёнка.', array['остановка', 'точка посадки', 'где забирают', 'логистика'], 30),
  ('faq_stop_request', 'Можно ли выбрать остановку самостоятельно?', 'Родители могут предложить удобную точку, но окончательное решение принимает логистика с учётом безопасности и эффективности маршрута.', array['выбрать остановку', 'поменять остановку', 'удобная точка'], 30),
  ('faq_tracking', 'Можно ли отслеживать движение транспорта?', 'Да. После запуска маршрутов родителям предоставляется доступ к информации о движении транспорта и контактам ответственных лиц.', array['отслеживание', 'геолокация', 'где автобус', 'движение транспорта'], 30),
  ('faq_driver_route_change', 'Может ли измениться водитель или маршрут?', 'Да. OutWay гарантирует предоставление услуги трансфера, однако водитель и маршрут могут меняться при необходимости.', array['сменился водитель', 'изменился маршрут', 'другой водитель'], 30),
  ('faq_driver_requirements', 'Какие требования предъявляются к водителям?', 'На маршрутах работают лицензированные водители с необходимым стажем и документами, соответствующими требованиям законодательства.', array['водитель', 'лицензия', 'стаж', 'документы', 'безопасность'], 30),
  ('faq_apply_early', 'Когда лучше подавать заявку?', 'Чем раньше подана заявка, тем выше вероятность сохранить удобный маршрут в вашем районе и наличие свободных мест.', array['заявка', 'когда подавать', 'свободные места', 'регистрация'], 30),
  ('faq_exact_address', 'Зачем нужен точный адрес?', 'Адрес используется для расчёта маршрута, расстояния, тарифной зоны и стоимости трансфера.', array['точный адрес', 'зачем адрес', 'расстояние', 'зона'], 30),
  ('faq_price_calculation', 'Как рассчитывается стоимость?', 'Стоимость зависит от школы, расстояния до адреса и выбранного типа транспорта. Итоговая сумма определяется после расчёта маршрута.', array['расчёт стоимости', 'сколько стоит', 'цена', 'расстояние', 'тип транспорта'], 30),
  ('faq_after_application', 'Что происходит после отправки заявки?', 'Менеджер проверяет заявку, подтверждает данные и связывается с родителями для дальнейшего оформления.', array['после заявки', 'отправил заявку', 'подтверждение', 'оформление'], 30),
  ('faq_change_address', 'Можно ли изменить адрес после подачи заявки?', 'Да. Изменить адрес можно через менеджера, однако стоимость и маршрут могут быть пересчитаны.', array['изменить адрес', 'переезд', 'новый адрес', 'пересчёт'], 30),
  ('faq_termination', 'Как расторгнуть обслуживание?', 'Для прекращения обслуживания необходимо заранее уведомить компанию. Условия возврата и использования депозита определяются действующими правилами обслуживания.', array['расторгнуть', 'отказаться', 'прекратить', 'возврат', 'депозит'], 30),
  ('faq_provider', 'Кто оказывает услугу?', 'OutWay организует школьный трансфер и координирует маршруты. Перевозку выполняют привлечённые лицензированные перевозчики и водители.', array['кто оказывает', 'перевозчик', 'компания', 'OutWay'], 30)
) as seed(topic, question, answer, keywords, priority)
where not exists (
  select 1
  from public.v2_bot_knowledge existing
  where existing.branch_id is null and existing.topic = seed.topic
);

update public.v2_bot_knowledge
set source = 'parent_application_faq_2026_2027'
where topic like 'faq\_%' escape '\' and source = 'manual';
