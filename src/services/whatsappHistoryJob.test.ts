import { runHistoryJob, HistoryJob, HistoryJobDeps } from '../../supabase/functions/_shared/whatsappHistoryJob';

const job: HistoryJob = { window_end: '2026-11-20T10:00:00Z', chat_id: 'group@g.us', lease_id: 'lease', message_ids: null, position: 0,
  scanned: 0, imported: 0, existing: 0, other: 0, failed: 0, attempts: 0, discovery_attempts: 0, limited: false };
const deps = (overrides: Partial<HistoryJobDeps> = {}): HistoryJobDeps => ({
  isLinked: async () => true, discover: async () => ({ ids: ['M1', 'M2'], scanned: 8, limited: false }),
  importFile: async () => 'imported', now: () => Date.parse('2026-11-20T10:00:00Z'), ...overrides,
});

test('persists discovered files before starting OCR', async () => {
  const importFile = jest.fn();
  expect(await runHistoryJob(job, deps({ importFile }))).toMatchObject({ status: 'queued', message_ids: ['M1', 'M2'], scanned: 8, lease_id: null });
  expect(importFile).not.toHaveBeenCalled();
});
test('does not import from an unlinked group', async () => {
  const discover = jest.fn();
  expect(await runHistoryJob(job, deps({ isLinked: async () => false, discover }))).toMatchObject({ status: 'cancelled', lease_id: null });
  expect(discover).not.toHaveBeenCalled();
});
test('rechecks empty history twice to allow WhatsApp synchronization', async () => {
  const empty = deps({ discover: async () => ({ ids: [], scanned: 0, limited: false }) });
  expect(await runHistoryJob(job, empty)).toMatchObject({ status: 'queued', discovery_attempts: 1, next_run_at: '2026-11-20T10:02:00.000Z' });
  expect(await runHistoryJob({ ...job, discovery_attempts: 2 }, empty)).toMatchObject({ status: 'completed', message_ids: [] });
});
test('resumes from persisted position and finishes on the last file', async () => {
  const importFile = jest.fn().mockResolvedValue('imported');
  expect(await runHistoryJob({ ...job, message_ids: ['M1', 'M2'], position: 1, imported: 1 }, deps({ importFile })))
    .toMatchObject({ status: 'completed', position: 2, imported: 2, lease_id: null });
  expect(importFile).toHaveBeenCalledWith('M2');
});
test('counts already received files without creating a second receipt', async () => {
  expect(await runHistoryJob({ ...job, message_ids: ['M1'] }, deps({ importFile: async () => 'existing' })))
    .toMatchObject({ status: 'completed', position: 1, existing: 1 });
});
test('retries failed processing before advancing, without exposing provider secrets', async () => {
  const fail = deps({ importFile: async () => { throw new Error('secret in provider URL'); } });
  const state = { ...job, message_ids: ['M1', 'M2'] };
  const retry = await runHistoryJob(state, fail);
  expect(retry).toMatchObject({ status: 'queued', attempts: 1, next_run_at: '2026-11-20T10:01:00.000Z' });
  expect(retry).not.toHaveProperty('position');
  expect(JSON.stringify(retry)).not.toContain('secret');
  expect(await runHistoryJob({ ...state, attempts: 2 }, fail)).toMatchObject({ status: 'queued', position: 1, failed: 1, attempts: 0 });
});
test('stops unavailable discovery after three attempts and reports failure', async () => {
  expect(await runHistoryJob({ ...job, attempts: 2 }, deps({ discover: async () => { throw new Error('offline'); } })))
    .toMatchObject({ status: 'failed', attempts: 3, lease_id: null });
});
test('treats OCR failure as retryable and records final errors on the last file', async () => {
  expect(await runHistoryJob({ ...job, message_ids: ['M1'], attempts: 2 }, deps({ importFile: async () => 'failed' })))
    .toMatchObject({ status: 'completed', position: 1, failed: 1 });
});
