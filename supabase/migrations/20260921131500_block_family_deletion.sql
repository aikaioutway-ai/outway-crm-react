-- Applications/families must be preserved for history. Users should move a
-- family to the rejected status instead of deleting it.

drop policy if exists "block family deletion" on public.v2_families;
create policy "block family deletion"
on public.v2_families
as restrictive
for delete
to anon, authenticated
using (false);
