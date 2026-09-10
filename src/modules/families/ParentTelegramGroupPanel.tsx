import { useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, Save, X } from 'lucide-react';
import {
  fetchParentTelegramTransferGroup,
  ParentTelegramMember,
  ParentTelegramStatus,
  ParentTelegramTransferGroup,
  saveParentTelegramTransferGroup,
  setParentTelegramMemberStatus,
} from '../../services/parentTelegramService';

const STATUS_OPTIONS: Array<{ value: ParentTelegramStatus; label: string }> = [
  { value: 'connected', label: 'Подключён' },
  { value: 'invited', label: 'Приглашён' },
  { value: 'not_connected', label: 'Не подключён' },
  { value: 'no_telegram', label: 'Нет Telegram' },
  { value: 'declined', label: 'Отказался' },
];

interface Props {
  open: boolean;
  sessionToken: string;
  branchId: string;
  transferNumber: number;
  onClose: () => void;
}

export default function ParentTelegramGroupPanel({ open, sessionToken, branchId, transferNumber, onClose }: Props) {
  const [group, setGroup] = useState<ParentTelegramTransferGroup | null>(null);
  const [title, setTitle] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchParentTelegramTransferGroup({ sessionToken, branchId, transferNumber });
      setGroup(next);
      setTitle(next.title);
      setAdminPhone(next.adminPhone);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить данные группы.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
    // Reload only when the selected transfer or panel visibility changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branchId, transferNumber]);

  if (!open) return null;

  const saveSettings = async () => {
    if (!group || !title.trim()) return;
    setSaving(true);
    setError('');
    try {
      await saveParentTelegramTransferGroup({
        sessionToken,
        transferId: group.transferId,
        title: title.trim(),
        adminPhone: adminPhone.trim(),
      });
      setGroup({ ...group, title: title.trim(), adminPhone: adminPhone.trim() });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить группу.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (member: ParentTelegramMember, rawStatus: string) => {
    if (!group) return;
    const status = rawStatus === 'automatic' ? null : rawStatus as ParentTelegramStatus;
    const previous = group.members;
    setGroup({
      ...group,
      members: previous.map(item => item.familyId === member.familyId
        ? { ...item, status: status ?? item.automaticStatus, manual: status !== null }
        : item),
    });
    try {
      await setParentTelegramMemberStatus({ sessionToken, transferId: group.transferId, familyId: member.familyId, status });
    } catch (statusError) {
      setGroup({ ...group, members: previous });
      setError(statusError instanceof Error ? statusError.message : 'Не удалось изменить статус.');
    }
  };

  return (
    <div className="parent-telegram-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="parent-telegram-panel" role="dialog" aria-modal="true" aria-label={`Telegram-группа трансфера ${transferNumber}`}>
        <header className="parent-telegram-header">
          <div>
            <h2><MessageCircle size={20} /> Группа Telegram · трансфер #{transferNumber}</h2>
            <p>{group ? group.branchName : 'Загрузка данных трансфера…'}</p>
          </div>
          <button type="button" className="parent-telegram-icon-button" aria-label="Закрыть" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="parent-telegram-settings">
          <label>Название группы<input value={title} onChange={event => setTitle(event.target.value)} placeholder={`Родители · трансфер #${transferNumber}`} /></label>
          <label>Админский номер<input value={adminPhone} onChange={event => setAdminPhone(event.target.value)} placeholder="+996…" /></label>
          <button type="button" className="parent-telegram-save" disabled={saving || !group || !title.trim()} onClick={saveSettings}>
            <Save size={15} /> {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button type="button" className="parent-telegram-icon-button" title="Обновить статусы" disabled={loading} onClick={() => void load()}><RefreshCw size={17} /></button>
        </div>

        <p className="parent-telegram-note">Статус «Подключён» определяется автоматически после подтверждения номера родителем в боте. Менеджер может установить другой статус вручную. Саму группу нужно создать в Telegram и добавить бота: Telegram не разрешает боту создавать группы и добавлять людей только по номеру телефона.</p>
        {error && <div className="parent-telegram-error">{error}</div>}
        <div className="parent-telegram-table-wrap">
          <table className="parent-telegram-table">
            <thead><tr><th>Родитель</th><th>Телефон</th><th>Ребёнок</th><th>Адрес</th><th>Статус подключения</th></tr></thead>
            <tbody>
              {loading && !group ? <tr><td colSpan={5}>Загрузка…</td></tr> : group?.members.length ? group.members.map(member => (
                <tr key={member.familyId}>
                  <td>{member.parentName || '—'}</td><td>{member.phone || '—'}</td><td>{member.childrenNames || '—'}</td><td>{member.address || '—'}</td>
                  <td>
                    <select value={member.manual ? member.status : 'automatic'} onChange={event => void changeStatus(member, event.target.value)}>
                      <option value="automatic">Авто · {STATUS_OPTIONS.find(option => option.value === member.automaticStatus)?.label}</option>
                      {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </td>
                </tr>
              )) : <tr><td colSpan={5}>В этом трансфере пока нет родителей.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
