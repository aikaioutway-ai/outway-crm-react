-- Поиск семьи по ID (FAM-001062, 001062, 1062) в верхнем поиске и в таблице «Справочник».
-- Меняется только условие поиска; остальное тело функций остаётся как есть.

do $migration$
declare
  v_def text;
  v_new text;
begin
  -- Верхний поиск: ID семьи добавляется в строку, по которой ищется текст.
  select pg_get_functiondef('public.search_family_children(text,text,integer)'::regprocedure) into v_def;
  v_new := replace(v_def,
    $old$position(p_text in lower(coalesce(n.parent_name, '') || ' ' || coalesce(c.child_name, '')))$old$,
    $new$position(p_text in lower(n.id || ' ' || coalesce(n.parent_name, '') || ' ' || coalesce(c.child_name, '')))$new$);
  if v_new = v_def then
    raise exception 'search_family_children: search condition not found';
  end if;
  execute v_new;

  -- Таблица «Справочник»: поиск по ID семьи наравне с ФИО и телефонами.
  select pg_get_functiondef('public.get_families_page(uuid[],text,text,boolean,integer,boolean,integer,integer)'::regprocedure) into v_def;
  v_new := replace(v_def,
    $old$f.parent_name ilike '%' || p_search || '%' or$old$,
    $new$f.id ilike '%' || p_search || '%' or
        f.parent_name ilike '%' || p_search || '%' or$new$);
  if v_new = v_def then
    raise exception 'get_families_page: search condition not found';
  end if;
  execute v_new;
end
$migration$;
