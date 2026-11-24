export type HistoryJob = {
  window_end: string; chat_id: string; lease_id: string; message_ids: string[] | null; position: number;
  scanned: number; imported: number; existing: number; other: number; failed: number;
  attempts: number; discovery_attempts: number; limited: boolean;
};
export type HistoryJobDeps = {
  isLinked: () => Promise<boolean>;
  discover: () => Promise<{ ids: string[]; scanned: number; limited: boolean }>;
  importFile: (id: string) => Promise<'imported' | 'existing' | 'other' | 'failed'>;
  now: () => number;
};

// Один шаг сохраняется в базе. После сбоя тот же файл безопасно проверяется повторно.
export async function runHistoryJob(job: HistoryJob, deps: HistoryJobDeps): Promise<Record<string, unknown>> {
  const release = { lease_id: null, lease_until: null, updated_at: new Date(deps.now()).toISOString() };
  const queued = { ...release, status: 'queued', next_run_at: new Date(deps.now()).toISOString() };
  try {
    if (!await deps.isLinked()) return { ...release, status: 'cancelled', error: null };
    if (job.message_ids === null) {
      const history = await deps.discover();
      const discoveryAttempts = job.discovery_attempts + 1;
      // WhatsApp может передать историю не сразу: повторить пустой ответ ещё дважды.
      if (!history.ids.length && discoveryAttempts < 3) return {
        ...queued, scanned: history.scanned, discovery_attempts: discoveryAttempts, attempts: 0,
        next_run_at: new Date(deps.now() + 120000).toISOString(), error: null,
      };
      return { ...queued, status: history.ids.length ? 'queued' : 'completed', message_ids: history.ids,
        scanned: history.scanned, limited: history.limited, discovery_attempts: discoveryAttempts, attempts: 0, error: null };
    }
    const id = job.message_ids[job.position];
    if (!id) return { ...release, status: 'completed' };
    const result = await deps.importFile(id);
    if (result === 'failed') throw new Error('Не удалось распознать или сохранить файл. Будет повторная попытка.');
    const position = job.position + 1;
    return { ...queued, position, status: position >= job.message_ids.length ? 'completed' : 'queued',
      [result]: job[result] + 1, attempts: 0, error: null };
  } catch {
    const attempts = job.attempts + 1;
    const message = 'Не удалось загрузить историю или файл. Проверьте подключение Green API.';
    if (attempts < 3) return { ...queued, attempts, error: message, next_run_at: new Date(deps.now() + 60000).toISOString() };
    if (job.message_ids !== null) {
      const position = job.position + 1;
      return { ...queued, position, failed: job.failed + 1, attempts: 0, error: message,
        status: position >= job.message_ids.length ? 'completed' : 'queued' };
    }
    return { ...release, status: 'failed', attempts, error: message };
  }
}
