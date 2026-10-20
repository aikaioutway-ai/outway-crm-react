export function taskReadScope(role: string): { all: boolean; roles: string[]; team: boolean } {
  if (['admin', 'gen_director'].includes(role)) return { all: true, roles: [], team: true };
  const roles = role === 'director' ? ['manager', 'b2b_manager']
    : role === 'senior_logist' ? ['logist', 'b2b_logist']
    : role === 'cashier' ? ['cashier'] : [];
  return { all: false, roles, team: roles.length > 0 };
}
export interface TaskCounts { total: number; open: number; completed: number; overdue: number; review: number }
export function countTask(task: { status: string; due_at: string }, now: number): TaskCounts {
  const open = !['done', 'cancelled'].includes(task.status);
  return { total: 1, open: Number(open), completed: Number(task.status === 'done'), overdue: Number(open && Date.parse(task.due_at) < now), review: Number(task.status === 'review') };
}
