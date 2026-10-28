import { FUNCTIONS_REGION, SUPABASE_URL, withFunctionsRegion } from './supabase';

test('server functions run next to the database region', () => {
  expect(withFunctionsRegion(`${SUPABASE_URL}/functions/v1/task-api`))
    .toBe(`${SUPABASE_URL}/functions/v1/task-api?forceFunctionRegion=${FUNCTIONS_REGION}`);
});

test('table requests and an explicit region stay unchanged', () => {
  const rest = `${SUPABASE_URL}/rest/v1/v2_families?select=id`;
  expect(withFunctionsRegion(rest)).toBe(rest);
  const explicit = `${SUPABASE_URL}/functions/v1/task-api?forceFunctionRegion=us-east-1`;
  expect(withFunctionsRegion(explicit)).toBe(explicit);
});
