-- OutWay CRM: full Supabase schema inventory for Codex
-- Run in Supabase SQL Editor, then export/download the result as CSV.

with columns_info as (
  select
    'columns' as section,
    c.table_schema as object_schema,
    c.table_name as object_name,
    jsonb_build_object(
      'column_name', c.column_name,
      'ordinal_position', c.ordinal_position,
      'data_type', c.data_type,
      'udt_name', c.udt_name,
      'is_nullable', c.is_nullable,
      'column_default', c.column_default
    ) as detail
  from information_schema.columns c
  where c.table_schema not in ('pg_catalog', 'information_schema')
),
constraints_info as (
  select
    'constraints' as section,
    tc.table_schema as object_schema,
    tc.table_name as object_name,
    jsonb_build_object(
      'constraint_name', tc.constraint_name,
      'constraint_type', tc.constraint_type,
      'column_name', kcu.column_name,
      'foreign_table_schema', ccu.table_schema,
      'foreign_table_name', ccu.table_name,
      'foreign_column_name', ccu.column_name
    ) as detail
  from information_schema.table_constraints tc
  left join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
    and tc.table_schema = kcu.table_schema
  left join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
    and ccu.table_schema = tc.table_schema
  where tc.table_schema not in ('pg_catalog', 'information_schema')
),
rls_info as (
  select
    'rls' as section,
    t.schemaname as object_schema,
    t.tablename as object_name,
    jsonb_build_object('rowsecurity', t.rowsecurity) as detail
  from pg_tables t
  where t.schemaname not in ('pg_catalog', 'information_schema')
),
policies_info as (
  select
    'policies' as section,
    p.schemaname as object_schema,
    p.tablename as object_name,
    jsonb_build_object(
      'policyname', p.policyname,
      'permissive', p.permissive,
      'roles', p.roles,
      'cmd', p.cmd,
      'qual', p.qual,
      'with_check', p.with_check
    ) as detail
  from pg_policies p
),
functions_info as (
  select
    'functions' as section,
    n.nspname as object_schema,
    pr.proname as object_name,
    jsonb_build_object(
      'arguments', pg_get_function_arguments(pr.oid),
      'returns', pg_get_function_result(pr.oid),
      'definition', pg_get_functiondef(pr.oid)
    ) as detail
  from pg_proc pr
  join pg_namespace n on n.oid = pr.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
),
triggers_info as (
  select
    'triggers' as section,
    tr.event_object_schema as object_schema,
    tr.event_object_table as object_name,
    jsonb_build_object(
      'trigger_name', tr.trigger_name,
      'action_timing', tr.action_timing,
      'event_manipulation', tr.event_manipulation,
      'action_statement', tr.action_statement
    ) as detail
  from information_schema.triggers tr
  where tr.trigger_schema not in ('pg_catalog', 'information_schema')
),
enums_info as (
  select
    'enums' as section,
    n.nspname as object_schema,
    t.typname as object_name,
    jsonb_build_object('enum_value', e.enumlabel, 'sort_order', e.enumsortorder) as detail
  from pg_type t
  join pg_enum e on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
),
buckets_info as (
  select
    'storage_buckets' as section,
    'storage' as object_schema,
    b.name as object_name,
    to_jsonb(b) as detail
  from storage.buckets b
)
select section, object_schema, object_name, detail
from columns_info
union all
select section, object_schema, object_name, detail from constraints_info
union all
select section, object_schema, object_name, detail from rls_info
union all
select section, object_schema, object_name, detail from policies_info
union all
select section, object_schema, object_name, detail from functions_info
union all
select section, object_schema, object_name, detail from triggers_info
union all
select section, object_schema, object_name, detail from enums_info
union all
select section, object_schema, object_name, detail from buckets_info
order by section, object_schema, object_name, detail::text;
