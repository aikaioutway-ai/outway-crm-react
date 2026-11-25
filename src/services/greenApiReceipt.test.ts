import {
  parseGreenApiGroup,
  parseGreenApiReceipt,
  phoneSuffix,
  processIncomingReceipt,
  safeEqual,
  webhookTokenMatches,
  senderPhoneFromId,
  type IncomingReceipt,
  type ReceiptDeps,
  type RecognizedReceipt,
} from '../../supabase/functions/_shared/greenApiReceipt';
import { summarizeBySchool } from '../../supabase/functions/_shared/incomingReceiptsAccess';

const payload = (overrides: Record<string, unknown> = {}, file: Record<string, unknown> = {}) => ({
  typeWebhook: 'incomingMessageReceived',
  instanceData: { idInstance: 7103000000 },
  timestamp: 1794980000,
  idMessage: 'MSG1',
  senderData: {
    chatId: '120363369140947676@g.us',
    chatName: 'Трансфер 12',
    sender: '996555123456@c.us',
    senderName: 'Айгуль',
    senderContactName: '',
  },
  messageData: {
    typeMessage: 'imageMessage',
    fileMessageData: { downloadUrl: 'https://files.example/1', mimeType: 'image/jpeg', caption: 'за май', ...file },
  },
  ...overrides,
});

const receipt = parseGreenApiReceipt(payload()) as IncomingReceipt;
const recognized: RecognizedReceipt = {
  receipt_code: 'ABC', time: '12:30', card_last4: '0176', bank: 'MBANK', amount: 6800, date: '2026-11-18',
};

function deps(overrides: Partial<ReceiptDeps> = {}): ReceiptDeps & { storeFile: jest.Mock } {
  return {
    download: jest.fn().mockResolvedValue(new Uint8Array([1, 2])),
    sha256: jest.fn().mockResolvedValue('hash'),
    recognize: jest.fn().mockResolvedValue(recognized),
    storeFile: jest.fn().mockResolvedValue(undefined),
    findDuplicate: jest.fn().mockResolvedValue(null),
    findFamilies: jest.fn().mockResolvedValue(['F1']),
    now: () => '2026-11-18T10:00:00.000Z',
    ...overrides,
  } as ReceiptDeps & { storeFile: jest.Mock };
}

describe('parseGreenApiReceipt', () => {
  test('reads an image from a group', () => {
    expect(receipt).toMatchObject({
      instanceId: '7103000000', messageId: 'MSG1', senderPhone: '996555123456', senderName: 'Айгуль',
      caption: 'за май', mimeType: 'image/jpeg', fileName: null,
    });
  });

  test('accepts a PDF document and keeps its name', () => {
    const parsed = parseGreenApiReceipt(payload({
      messageData: { typeMessage: 'documentMessage', fileMessageData: { downloadUrl: 'https://f/1', mimeType: 'application/pdf', fileName: 'чек.pdf' } },
    }));
    expect(parsed).toMatchObject({ mimeType: 'application/pdf', fileName: 'чек.pdf' });
  });

  test('ignores private chats, other events and unsupported files', () => {
    expect(parseGreenApiReceipt(payload({ senderData: { chatId: '996555123456@c.us', sender: '996555123456@c.us' } }))).toBeNull();
    expect(parseGreenApiReceipt(payload({ typeWebhook: 'outgoingMessageReceived' }))).toBeNull();
    expect(parseGreenApiReceipt(payload({ messageData: { typeMessage: 'textMessage' } }))).toBeNull();
    expect(parseGreenApiReceipt(payload({
      messageData: { typeMessage: 'documentMessage', fileMessageData: { downloadUrl: 'https://f/1', mimeType: 'application/zip' } },
    }))).toBeNull();
  });
});

test('remembers any group message, but not private chats', () => {
  const base = { typeWebhook: 'incomingMessageReceived', instanceData: { idInstance: 1 }, senderData: { chatId: '1203@g.us', chatName: 'Трансфер 12' }, messageData: { typeMessage: 'textMessage' } };
  expect(parseGreenApiGroup(base)).toEqual({ instanceId: '1', chatId: '1203@g.us', chatName: 'Трансфер 12', verified: true });
  expect(parseGreenApiGroup({ ...base, typeWebhook: 'outgoingMessageReceived' })).toMatchObject({ chatId: '1203@g.us', verified: true });
  expect(parseGreenApiGroup({ ...base, typeWebhook: 'outgoingMessageStatus' })).toBeNull();
  expect(parseGreenApiGroup({ ...base, senderData: { chatId: '996555@c.us' } })).toBeNull();
  expect(parseGreenApiGroup({ ...base, senderData: { chatId: '996555@c.us' }, messageData: { typeMessage: 'groupInviteMessage',
    groupInviteMessageData: { groupJid: '777@g.us', groupName: 'Трансфер 9' } } })).toEqual({ instanceId: '1', chatId: '777@g.us', chatName: 'Трансфер 9', verified: false });
});

test('schools sum the receipts of their transfers', () => {
  const tabs = [{ key: 'TIS', label: 'TIS', codes: ['TENSAY'], branches: [] }];
  const branches = [{ id: 'b1', code: 'TENSAY', short_name: null, name: null }];
  const transfer = { transfer_id: 't', branch_id: 'b1', transfer_number: 1, chat_id: 'g@g.us', group_name: 'g', review: 2, duplicates: 1, other: 0, total: 3 };
  const result = summarizeBySchool([transfer, { ...transfer, transfer_id: 't2', chat_id: null, review: 1, total: 1, duplicates: 0 }, { ...transfer, branch_id: 'unknown' }], branches, tabs);
  expect(result.schools).toEqual([{ key: 'TIS', transfers: 2, linked: 1, review: 3, duplicates: 1, other: 0, total: 4 }]);
  expect(result.transfers.map(row => row.school_key)).toEqual(['TIS', 'TIS']);
});

test('never treats an internal WhatsApp id as a phone', () => {
  expect(senderPhoneFromId('155508384256027@lid')).toBeNull();
  expect(senderPhoneFromId('996555123456@c.us')).toBe('996555123456');
  expect(phoneSuffix('0555 123-456')).toBe('555123456');
  expect(phoneSuffix('12345')).toBeNull();
});

test('compares webhook tokens exactly', () => {
  expect(safeEqual('Bearer a', 'Bearer a')).toBe(true);
  expect(safeEqual('Bearer a', 'Bearer ab')).toBe(false);
});

test('accepts the webhook password with one or two Bearer words, nothing else', () => {
  expect(webhookTokenMatches('Bearer secret123', 'secret123')).toBe(true);
  expect(webhookTokenMatches('Bearer Bearer secret123', 'secret123')).toBe(true);
  expect(webhookTokenMatches('secret123', 'secret123')).toBe(true);
  expect(webhookTokenMatches('Bearer secret12', 'secret123')).toBe(false);
  expect(webhookTokenMatches('', '')).toBe(false);
});

describe('processIncomingReceipt', () => {
  test('stores a recognized receipt with the single matching family', async () => {
    const dependencies = deps();
    const patch = await processIncomingReceipt('id1', receipt, dependencies);
    expect(dependencies.storeFile).toHaveBeenCalledWith('id1.jpg', expect.any(Uint8Array), 'image/jpeg');
    expect(dependencies.findFamilies).toHaveBeenCalledWith('555123456');
    expect(patch).toMatchObject({
      status: 'recognized', amount: 6800, receipt_date: '2026-11-18', match_status: 'matched', family_id: 'F1', storage_path: 'id1.jpg',
    });
  });

  test('keeps an ordinary photo as an other file for the manager', async () => {
    const dependencies = deps({ recognize: jest.fn().mockResolvedValue({ ...recognized, amount: null, date: null, receipt_code: null }) });
    const patch = await processIncomingReceipt('id1', receipt, dependencies);
    expect(patch).toMatchObject({ status: 'other', storage_path: 'id1.jpg', family_id: 'F1', sender_phone: '996555123456' });
    expect(patch).not.toHaveProperty('amount');
    expect(dependencies.storeFile).toHaveBeenCalled();
    expect(dependencies.findDuplicate).not.toHaveBeenCalled();
  });

  test('a receipt with only an amount still goes to review', async () => {
    const patch = await processIncomingReceipt('id1', receipt, deps({ recognize: jest.fn().mockResolvedValue({ ...recognized, date: null }) }));
    expect(patch).toMatchObject({ status: 'recognized', amount: 6800, receipt_date: null });
  });

  test('does not guess a family when a phone is shared', async () => {
    const patch = await processIncomingReceipt('id1', receipt, deps({ findFamilies: jest.fn().mockResolvedValue(['F1', 'F2']) }));
    expect(patch).toMatchObject({ match_status: 'multiple', family_id: null, family_match_count: 2 });
  });

  test('marks a hidden sender number without searching families', async () => {
    const dependencies = deps();
    const patch = await processIncomingReceipt('id1', { ...receipt, senderPhone: null }, dependencies);
    expect(patch).toMatchObject({ status: 'recognized', match_status: 'no_phone', family_id: null });
    expect(dependencies.findFamilies).not.toHaveBeenCalled();
  });

  test('records a duplicate of an existing payment', async () => {
    const patch = await processIncomingReceipt('id1', receipt, deps({
      findDuplicate: jest.fn().mockResolvedValue({ payment_id: 'P1', match_type: 'code' }),
    }));
    expect(patch).toMatchObject({ duplicate_payment_id: 'P1', duplicate_match_type: 'code' });
  });

  test('keeps the file when recognition fails', async () => {
    const dependencies = deps({ recognize: jest.fn().mockRejectedValue(new Error('down')) });
    const patch = await processIncomingReceipt('id1', receipt, dependencies);
    expect(patch).toMatchObject({ status: 'failed', error: 'ocr_failed', storage_path: 'id1.jpg' });
  });

  test('reports a failed download or a missing link', async () => {
    await expect(processIncomingReceipt('id1', receipt, deps({ download: jest.fn().mockRejectedValue(new Error('x')) })))
      .resolves.toMatchObject({ status: 'failed', error: 'download_failed' });
    await expect(processIncomingReceipt('id1', { ...receipt, fileUrl: '' }, deps()))
      .resolves.toMatchObject({ status: 'failed', error: 'missing_download_url' });
  });
});
