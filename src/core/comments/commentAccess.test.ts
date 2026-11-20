import fs from 'fs';
import path from 'path';
import ts from 'typescript';

// Load the Edge Function's Deno imports with the same local modules in Jest.
function loadModule(file: string): any {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', source)(
    (name: string) => loadModule(path.resolve(path.dirname(file), name)), module.exports, module,
  );
  return module.exports;
}
const { authorizeCell } = loadModule(path.resolve(__dirname, '../../../supabase/functions/cell-comments-api/access.ts'));
const target = { table: 'families_table_accruals', row: 'child-1', column: 'deposit', context: '' };
function database(exists: boolean) {
  const query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: exists ? { id: 'child-1' } : null }) };
  return { from: jest.fn().mockReturnValue(query) };
}

test.each(['director', 'gen_director'])('accrual comments allow %s for an existing child', async role => {
  expect(await authorizeCell(database(true), { id: 'employee', role }, target)).toBe(true);
});
test('allows the designated administrator', async () => {
  expect(await authorizeCell(database(true), { id: 'emp-admin', role: 'admin' }, target)).toBe(true);
});
test.each(['manager', 'cashier', 'logist', 'senior_logist', 'admin'])('does not grant accrual access to other %s employees', async role => {
  const db = database(true);
  expect(await authorizeCell(db, { id: 'other', role }, target)).toBe(false);
  expect(db.from).not.toHaveBeenCalled();
});
test('rejects a missing child even for leadership', async () => {
  expect(await authorizeCell(database(false), { id: 'employee', role: 'director' }, target)).toBe(false);
});
test('also recognizes the versioned table identifier', async () => {
  expect(await authorizeCell(database(true), { id: 'employee', role: 'director' }, { ...target, table: 'families_table_accruals_v3' })).toBe(true);
});

const employeeTarget = { table: 'employees_table', row: 'employee-1', column: 'name', context: '' };
function employeeDatabase(recordRole: string | null) {
  const query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: recordRole ? { id: 'employee-1', role: recordRole } : null }) };
  return { from: jest.fn().mockReturnValue(query) };
}
test.each(['employees_table', 'employees_table_v2'])('employee comments accept table identifier %s', async table => {
  expect(await authorizeCell(employeeDatabase('manager'), { role: 'admin' }, { ...employeeTarget, table })).toBe(true);
});
test('director can comment on managers but not other directors', async () => {
  expect(await authorizeCell(employeeDatabase('manager'), { role: 'director' }, employeeTarget)).toBe(true);
  expect(await authorizeCell(employeeDatabase('director'), { role: 'director' }, employeeTarget)).toBe(false);
});
test('logistics lead retains employee scope', async () => {
  expect(await authorizeCell(employeeDatabase('logist'), { role: 'senior_logist' }, employeeTarget)).toBe(true);
  expect(await authorizeCell(employeeDatabase('manager'), { role: 'senior_logist' }, employeeTarget)).toBe(false);
});
test('manager cannot access employee comments', async () => {
  expect(await authorizeCell(employeeDatabase('manager'), { role: 'manager' }, employeeTarget)).toBe(false);
});
test('missing employee is denied even for admin', async () => {
  expect(await authorizeCell(employeeDatabase(null), { role: 'admin' }, employeeTarget)).toBe(false);
});
