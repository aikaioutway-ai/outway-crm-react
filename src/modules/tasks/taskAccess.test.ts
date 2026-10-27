import { countTask, taskReadScope, taskVisibilityFilter } from '../../../supabase/functions/task-api/access';

test('only general director and admin can read every task', () => {
  expect(taskReadScope('gen_director').all).toBe(true);
  expect(taskReadScope('admin').all).toBe(true);
  expect(taskReadScope('director')).toEqual({all:false,roles:['manager','b2b_manager'],team:true});
});

test('department leads and cashiers have the requested team scope', () => {
  expect(taskReadScope('senior_logist').roles).toEqual(['logist','b2b_logist']);
  expect(taskReadScope('cashier').roles).toEqual(['cashier']);
  expect(taskReadScope('logist')).toEqual({all:false,roles:[],team:false});
  expect(taskReadScope('manager').team).toBe(false);
});

test('completed and cancelled tasks never count as overdue', () => {
  const now = Date.parse('2026-10-20T10:00:00Z');
  const task = {status:'in_progress',due_at:'2026-10-19T10:00:00Z'};
  expect(countTask(task,now)).toEqual({total:1,open:1,completed:0,overdue:1,review:0});
  expect(countTask({...task,status:'done'},now)).toEqual({total:1,open:0,completed:1,overdue:0,review:0});
  expect(countTask({...task,status:'cancelled'},now).overdue).toBe(0);
  expect(countTask({...task,status:'review'},now).review).toBe(1);
});


test('visibility includes any participant and department colleagues using array predicates',()=>{
  expect(taskVisibilityFilter('manager',['logist','b2b'])).toBe('creator_id.eq."manager",assignee_ids.cs.{"manager"},observer_id.eq."manager",assignee_ids.ov.{"logist","b2b"}');
  expect(taskVisibilityFilter('employee',[])).not.toContain('assignee_ids.ov');
  expect(taskVisibilityFilter('with,comma',[])).toContain('assignee_ids.cs.{"with,comma"}');
});
