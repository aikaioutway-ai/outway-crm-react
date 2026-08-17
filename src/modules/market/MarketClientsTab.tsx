import React, { FormEvent, useEffect, useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { fetchMarketClients, fetchMarketSchools, saveMarketClient } from '../../services/marketService';
import { MarketClient, MarketSchoolOption } from './marketTypes';

interface ClientModalProps {
  client: MarketClient | null;
  schools: MarketSchoolOption[];
  sessionToken?: string;
  onClose: () => void;
  onSaved: (client: MarketClient) => void;
}

function ClientModal({ client, schools, sessionToken, onClose, onSaved }: ClientModalProps) {
  const [schoolId, setSchoolId] = useState(client?.schoolId ?? '');
  const [name, setName] = useState(client?.name ?? '');
  const [contactPerson, setContactPerson] = useState(client?.contactPerson ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [address, setAddress] = useState(client?.address ?? '');
  const [login, setLogin] = useState(client?.login ?? '');
  const [password, setPassword] = useState('');
  const [comment, setComment] = useState(client?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pickSchool = (id: string) => {
    setSchoolId(id);
    const school = schools.find(item => item.id === id);
    if (school && !name.trim()) setName(school.name);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !login.trim()) {
      setError('Заполните название клиента и логин для портала.');
      return;
    }
    if (!client && !password.trim()) {
      setError('Задайте пароль для входа в портал школы.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await saveMarketClient({
        id: client?.id,
        schoolId: schoolId || null,
        name: name.trim(),
        contactPerson: contactPerson.trim(),
        phone: phone.trim(),
        address: address.trim(),
        login: login.trim(),
        password: password.trim() || undefined,
        comment: comment.trim(),
      }, sessionToken);
      onSaved(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить клиента');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="market-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="market-modal" role="dialog" aria-modal="true" aria-label="Клиент Маркета">
        <div className="market-modal-head">
          <h2>{client ? 'Редактировать клиента' : 'Новый клиент'}</h2>
          <button className="market-modal-close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <form className="market-form" onSubmit={submit}>
          <div className="market-field full">
            <label>Привязка к школе (необязательно)</label>
            <select value={schoolId} onChange={e => pickSchool(e.target.value)}>
              <option value="">— Не связано со школой из CRM —</option>
              {schools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
            </select>
          </div>
          <div className="market-field full"><label>Название клиента</label><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Название школы/организации" /></div>
          <div className="market-field"><label>Контактное лицо</label><input value={contactPerson} onChange={e => setContactPerson(e.target.value)} /></div>
          <div className="market-field"><label>Телефон</label><input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div className="market-field full"><label>Адрес доставки</label><input value={address} onChange={e => setAddress(e.target.value)} /></div>
          <div className="market-field"><label>Логин для портала</label><input value={login} onChange={e => setLogin(e.target.value)} placeholder="school-login" /></div>
          <div className="market-field"><label>{client ? 'Новый пароль (необязательно)' : 'Пароль для портала'}</label><input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder={client ? 'Оставьте пустым, чтобы не менять' : ''} /></div>
          <div className="market-field full"><label>Комментарий</label><textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Необязательно" /></div>
          {error && <div className="market-form-error">{error}</div>}
          <div className="market-form-actions">
            <button type="button" className="market-cancel" onClick={onClose}>Отмена</button>
            <button type="submit" className="market-save" disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MarketClientsTab({ sessionToken }: { sessionToken?: string }) {
  const [rows, setRows] = useState<MarketClient[]>([]);
  const [schools, setSchools] = useState<MarketSchoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<MarketClient | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchMarketClients(sessionToken), fetchMarketSchools(sessionToken)])
      .then(([clients, schoolOptions]) => { if (active) { setRows(clients); setSchools(schoolOptions); } })
      .catch(reason => { if (active) setLoadError(reason instanceof Error ? reason.message : 'Не удалось загрузить клиентов'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionToken]);

  const handleSaved = (client: MarketClient) => {
    setEditing(undefined);
    setRows(current => {
      const exists = current.some(row => row.id === client.id);
      return exists ? current.map(row => (row.id === client.id ? client : row)) : [client, ...current];
    });
  };

  return (
    <div className="market-panel">
      <div className="market-panel-title">
        <span>Клиенты Маркета</span>
        <button className="market-add" onClick={() => setEditing(null)}><Plus size={16} /> Новый клиент</button>
      </div>
      {loadError && <div className="market-load-error">Не удалось загрузить данные: {loadError}. Проверьте, что миграция и функция market-api применены.</div>}
      {loading ? <div className="market-empty">Загрузка…</div> : rows.length === 0 ? (
        <div className="market-empty">Клиентов пока нет — добавьте первого</div>
      ) : (
        <div className="market-table-wrap">
          <table className="market-table">
            <thead><tr>
              <th>Название</th><th>Школа CRM</th><th>Контакт</th><th>Телефон</th><th>Логин портала</th><th>Статус</th><th></th>
            </tr></thead>
            <tbody>{rows.map(row => (
              <tr key={row.id}>
                <td className="market-name">{row.name}</td>
                <td>{row.schoolName || '—'}</td>
                <td>{row.contactPerson || '—'}</td>
                <td>{row.phone || '—'}</td>
                <td>{row.login}</td>
                <td><span className={`market-badge${row.active ? '' : ' muted'}`}>{row.active ? 'Активен' : 'Скрыт'}</span></td>
                <td><button className="market-icon-btn" onClick={() => setEditing(row)} aria-label="Редактировать"><Pencil size={15} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {editing !== undefined && (
        <ClientModal client={editing} schools={schools} sessionToken={sessionToken} onClose={() => setEditing(undefined)} onSaved={handleSaved} />
      )}
    </div>
  );
}
