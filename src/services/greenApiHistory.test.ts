import { historyCandidates, historyPeriod, historyWeek, parseHistoryReceipt } from '../../supabase/functions/_shared/greenApiHistory';

const row = {
  type: 'incoming', chatId: 'group@g.us', idMessage: 'M1', timestamp: Date.parse('2026-11-19T18:00:00Z') / 1000,
  typeMessage: 'documentMessage', mimeType: 'application/pdf', downloadUrl: 'https://files.example/receipt.pdf',
  fileName: 'receipt.pdf', senderId: '996555123456@c.us', senderName: 'Родитель', caption: 'Ноябрь',
};

test('normalizes provider history into the same receipt as live webhooks', () => {
  expect(parseHistoryReceipt(row, '123', row.chatId, 'Трансфер 4')).toMatchObject({
    messageId: 'M1', instanceId: '123', chatName: 'Трансфер 4', senderPhone: '996555123456',
    fileName: 'receipt.pdf', mimeType: 'application/pdf', caption: 'Ноябрь', fileUrl: row.downloadUrl,
  });
});

test('ignores outgoing messages, deleted files, other chats and unsupported media', () => {
  for (const change of [{ type: 'outgoing' }, { isDeleted: true }, { chatId: 'other@g.us' }, { typeMessage: 'videoMessage' }, { mimeType: 'text/plain' }, { timestamp: 1e20 }]) {
    expect(parseHistoryReceipt({ ...row, ...change }, '123', row.chatId, null)).toBeNull();
  }
});

test('filters by full Bishkek calendar days, including their boundaries', () => {
  const period = historyPeriod('2026-11-20', '2026-11-20');
  const rows = [-1, 0, 86399, 86400].map((offset, index) => ({ ...row, idMessage: String(index), timestamp: row.timestamp + offset }));
  expect(historyCandidates(rows, '123', row.chatId, null, period).map(receipt => receipt.messageId)).toEqual(['1', '2']);
});

test('rejects malformed, impossible and reversed dates', () => {
  for (const dates of [['2026-02-30', '2026-03-01'], ['2026-13-01', '2026-13-02'], ['', '2026-11-20'], ['2026-11-21', '2026-11-20']]) {
    expect(() => historyPeriod(...dates as [string, string])).toThrow('Укажите корректный период');
  }
});

test('weekly import includes only the fixed seven days before linking, excluding older and future messages', () => {
  const end = Date.parse('2026-11-20T10:00:00Z');
  const period = historyWeek(end);
  expect(period.start).toBe(Date.parse('2026-11-13T10:00:00Z'));
  const rows = [period.start - 1000, period.start, end, end + 1000].map((timestamp, index) => ({ ...row, idMessage: String(index), timestamp: timestamp / 1000 }));
  expect(historyCandidates(rows, '123', row.chatId, null, period).map(receipt => receipt.messageId)).toEqual(['1', '2']);
});
