import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Eye, EyeOff, Plus, Save, Trash2, UserCog } from 'lucide-react';
import { Employee, EmployeeRole, EmployeeStatus } from '../../types';
import { deleteEmployee, EmployeeDraft, fetchEmployees, saveEmployee } from '../../services/employeeService';
import { SCHOOL_TABS } from '../families/constants';

const ROLE_OPTIONS: { value: EmployeeRole; label: string }[] = [
  { value: 'admin', label: 'Админ' },
  { value: 'director', label: 'Директор' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'cashier', label: 'Кассир' },
  { value: 'logist', label: 'Логист' },
  { value: 'driver', label: 'Водитель' },
];

const STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: 'active', label: 'Активен' },
  { value: 'inactive', label: 'Неактивен' },
  { value: 'dismissed', label: 'Уволен' },
];

const EMPTY_DRAFT: EmployeeDraft = {
  fullName: '',
  login: '',
  password: '',
  role: 'manager',
  position: 'Менеджер',
  phone1: '',
  phone2: '',
  address: '',
  schoolKeys: [],
  status: 'active',
  startDate: new Date().toISOString().slice(0, 10),
  comment: '',
};

const SCHOOL_OPTIONS = SCHOOL_TABS.filter(item => item.key !== 'ALL').map(item => ({ key: item.key, label: item.label }));

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmployeeDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmployees()
      .then(data => {
        setEmployees(data);
        setSelectedId(data[0]?.id ?? null);
        if (data[0]) setDraft(toDraft(data[0]));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const selected = employees.find(item => item.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(item => [
      item.fullName,
      item.login,
      item.position,
      item.phone1,
      item.phone2,
      schoolsLabel(item.schoolKeys),
    ].some(value => String(value ?? '').toLowerCase().includes(q)));
  }, [employees, query]);

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter(item => item.status === 'active').length,
    managers: employees.filter(item => item.role === 'manager').length,
  }), [employees]);

  function selectEmployee(employee: Employee) {
    setSelectedId(employee.id);
    setDraft(toDraft(employee));
    setMessage('');
  }

  function newEmployee() {
    setSelectedId(null);
    setDraft({ ...EMPTY_DRAFT, startDate: new Date().toISOString().slice(0, 10) });
    setShowPassword(false);
    setMessage('');
  }

  async function submit() {
    if (!draft.fullName.trim() || !draft.login.trim()) {
      setMessage('Заполните ФИО и логин');
      return;
    }
    const duplicate = employees.some(item => item.login === draft.login.trim() && item.id !== draft.id);
    if (duplicate) {
      setMessage('Такой логин уже есть');
      return;
    }
    const next = await saveEmployee(draft);
    setEmployees(next);
    const saved = next.find(item => item.login === draft.login.trim());
    setSelectedId(saved?.id ?? null);
    if (saved) setDraft(toDraft(saved));
    setMessage('Сохранено');
    setTimeout(() => setMessage(''), 1800);
  }

  async function remove() {
    if (!selectedId || !window.confirm('Удалить сотрудника?')) return;
    const next = await deleteEmployee(selectedId);
    setEmployees(next);
    setSelectedId(next[0]?.id ?? null);
    setDraft(next[0] ? toDraft(next[0]) : EMPTY_DRAFT);
  }

  function patch(updates: Partial<EmployeeDraft>) {
    setDraft(current => ({ ...current, ...updates }));
  }

  function toggleSchool(key: string) {
    setDraft(current => {
      if (key === 'ALL') return { ...current, schoolKeys: ['ALL'] };
      const currentKeys = current.schoolKeys.filter(item => item !== 'ALL');
      const next = currentKeys.includes(key)
        ? currentKeys.filter(item => item !== key)
        : [...currentKeys, key];
      return { ...current, schoolKeys: next };
    });
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--text-2)' }}>Загрузка сотрудников...</div>;

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#111827' }}>Сотрудники</div>
          <div style={{ marginTop: 3, fontSize: 12, fontWeight: 650, color: '#7B8491' }}>
            должности, доступы, контакты и школы
          </div>
        </div>
        <button onClick={newEmployee} style={primaryButtonStyle}>
          <Plus size={15} /> Сотрудник
        </button>
      </header>

      <div style={statsStyle}>
        <Metric label="Всего" value={stats.total} />
        <Metric label="Активные" value={stats.active} />
        <Metric label="Менеджеры" value={stats.managers} />
      </div>

      <div style={layoutStyle}>
        <section style={listStyle}>
          <div style={listToolbarStyle}>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Поиск по сотрудникам..."
              style={searchStyle}
            />
          </div>

          <div style={{ overflow: 'auto', minHeight: 0 }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>ФИО</Th>
                  <Th>Должность</Th>
                  <Th>Роль</Th>
                  <Th>Школы</Th>
                  <Th>Телефон</Th>
                  <Th>Статус</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(employee => {
                  const active = selectedId === employee.id;
                  return (
                    <tr key={employee.id} onClick={() => selectEmployee(employee)} style={{ cursor: 'pointer', background: active ? '#FFEDD5' : '#fff' }}>
                      <Td strong>{employee.fullName}</Td>
                      <Td>{employee.position || '-'}</Td>
                      <Td>{roleLabel(employee.role)}</Td>
                      <Td>{schoolsLabel(employee.schoolKeys)}</Td>
                      <Td>{employee.phone1 || '-'}</Td>
                      <Td>
                        <span style={statusBadgeStyle(employee.status)}>{statusLabel(employee.status)}</span>
                      </Td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#7B8491', fontSize: 13 }}>
                      Сотрудники не найдены
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside style={editorStyle}>
          <div style={editorHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={avatarStyle}><UserCog size={19} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>
                  {draft.id ? 'Карточка сотрудника' : 'Новый сотрудник'}
                </div>
                <div style={{ marginTop: 2, fontSize: 11, color: '#7B8491', fontWeight: 700 }}>
                  {selected?.login ? `логин: ${selected.login}` : 'логин и пароль задаёт управляющий'}
                </div>
              </div>
            </div>
            <button onClick={submit} style={saveButtonStyle}>
              <Save size={14} /> Сохранить
            </button>
          </div>

          {message && <div style={messageStyle(message.includes('Заполните') || message.includes('логин'))}>{message}</div>}

          <Section title="Основное">
            <Field label="ФИО"><Input value={draft.fullName} onChange={value => patch({ fullName: value })} /></Field>
            <Field label="Должность"><Input value={draft.position} onChange={value => patch({ position: value })} /></Field>
            <Field label="Роль">
              <Select value={draft.role} onChange={value => patch({ role: value as EmployeeRole })} options={ROLE_OPTIONS} />
            </Field>
            <Field label="Статус">
              <Select value={draft.status} onChange={value => patch({ status: value as EmployeeStatus })} options={STATUS_OPTIONS} />
            </Field>
            <Field label="Дата начала">
              <Input type="date" value={draft.startDate ?? ''} onChange={value => patch({ startDate: value })} />
            </Field>
          </Section>

          <Section title="Вход">
            <Field label="Логин"><Input value={draft.login} onChange={value => patch({ login: value })} /></Field>
            <Field label="Пароль">
              <div style={{ position: 'relative', minWidth: 0 }}>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={draft.password ?? ''}
                  onChange={value => patch({ password: value })}
                  placeholder={draft.id ? 'Оставить без изменений' : 'Новый пароль'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(value => !value)}
                  title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  style={passwordEyeStyle}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>
          </Section>

          <Section title="Контакты">
            <Field label="Телефон 1"><Input value={draft.phone1} onChange={value => patch({ phone1: value })} /></Field>
            <Field label="Телефон 2"><Input value={draft.phone2 ?? ''} onChange={value => patch({ phone2: value })} /></Field>
            <Field label="Адрес"><Input value={draft.address ?? ''} onChange={value => patch({ address: value })} /></Field>
            <Field label="Комментарий"><Input value={draft.comment ?? ''} onChange={value => patch({ comment: value })} /></Field>
          </Section>

          <Section title="Школы и доступы">
            <div style={schoolGridStyle}>
              <SchoolChip label="Все школы" active={draft.schoolKeys.includes('ALL')} onClick={() => toggleSchool('ALL')} />
              {SCHOOL_OPTIONS.map(option => (
                <SchoolChip
                  key={option.key}
                  label={option.label}
                  active={draft.schoolKeys.includes(option.key)}
                  onClick={() => toggleSchool(option.key)}
                />
              ))}
            </div>
          </Section>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={submit} style={saveButtonStyle}><Edit3 size={14} /> Применить</button>
            {draft.id && (
              <button onClick={remove} style={dangerButtonStyle}><Trash2 size={14} /> Удалить</button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function toDraft(employee: Employee): EmployeeDraft {
  return {
    id: employee.id,
    fullName: employee.fullName,
    login: employee.login,
    password: '',
    role: employee.role,
    position: employee.position,
    phone1: employee.phone1,
    phone2: employee.phone2 ?? '',
    address: employee.address ?? '',
    schoolKeys: employee.schoolKeys,
    status: employee.status,
    startDate: employee.startDate,
    comment: employee.comment ?? '',
  };
}

function roleLabel(role: EmployeeRole) {
  return ROLE_OPTIONS.find(item => item.value === role)?.label ?? role;
}

function statusLabel(status: EmployeeStatus) {
  return STATUS_OPTIONS.find(item => item.value === status)?.label ?? status;
}

function schoolsLabel(keys: string[]) {
  if (keys.includes('ALL')) return 'Все';
  return keys.length ? keys.join(', ') : '-';
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={metricStyle}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 14 }}>
      <div style={sectionTitleStyle}>{title}</div>
      <div style={{ display: 'grid', gap: 5 }}>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, type = 'text', placeholder }: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return <input type={type} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} style={controlStyle} />;
}

function Select({ value, onChange, options }: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={event => onChange(event.target.value)} style={controlStyle}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function SchoolChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={schoolChipStyle(active)}>
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <td style={{ ...tdStyle, fontWeight: strong ? 850 : 650 }}>{children}</td>;
}

const pageStyle: React.CSSProperties = {
  height: '100%',
  overflow: 'hidden',
  padding: 12,
  background: '#F7F9FB',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: '#fff',
  border: '1px solid #E8ECEF',
  borderRadius: 10,
  padding: '12px 14px',
};

const primaryButtonStyle: React.CSSProperties = {
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  borderRadius: 8,
  background: '#F59E0B',
  color: '#fff',
  padding: '0 12px',
  fontSize: 12,
  fontWeight: 850,
  cursor: 'pointer',
};

const statsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
};

const metricStyle: React.CSSProperties = {
  height: 40,
  border: '1px solid #E8ECEF',
  borderRadius: 10,
  background: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  color: '#6B7280',
  fontSize: 12,
  fontWeight: 800,
};

const layoutStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(520px, 1fr) 390px',
  gap: 10,
};

const listStyle: React.CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  background: '#fff',
  border: '1px solid #E8ECEF',
  borderRadius: 10,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const listToolbarStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: '1px solid #E8ECEF',
};

const searchStyle: React.CSSProperties = {
  width: '100%',
  height: 30,
  border: '1px solid #E8ECEF',
  borderRadius: 8,
  padding: '0 10px',
  fontSize: 12,
  fontWeight: 650,
  outline: 'none',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
};

const thStyle: React.CSSProperties = {
  height: 34,
  padding: '0 10px',
  borderBottom: '1px solid #E8ECEF',
  color: '#7B8491',
  fontSize: 11,
  fontWeight: 850,
  textAlign: 'left',
  background: '#F8FAFC',
};

const tdStyle: React.CSSProperties = {
  height: 38,
  padding: '0 10px',
  borderBottom: '1px solid #F0F3F5',
  color: '#111827',
  fontSize: 12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const editorStyle: React.CSSProperties = {
  minHeight: 0,
  overflowY: 'auto',
  background: '#fff',
  border: '1px solid #E8ECEF',
  borderRadius: 10,
  padding: 12,
};

const editorHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  borderBottom: '1px solid #E8ECEF',
  paddingBottom: 10,
};

const avatarStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  background: '#FFEDD5',
  color: '#F59E0B',
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
};

const saveButtonStyle: React.CSSProperties = {
  height: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  border: 'none',
  borderRadius: 8,
  background: '#FFEDD5',
  color: '#F59E0B',
  padding: '0 10px',
  fontSize: 11,
  fontWeight: 850,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const dangerButtonStyle: React.CSSProperties = {
  ...saveButtonStyle,
  background: '#FEE2E2',
  color: '#991B1B',
};

const messageStyle = (danger: boolean): React.CSSProperties => ({
  marginTop: 10,
  borderRadius: 8,
  padding: '8px 10px',
  background: danger ? '#FEE2E2' : '#F7F9FB',
  color: danger ? '#991B1B' : '#374151',
  fontSize: 12,
  fontWeight: 750,
});

const sectionTitleStyle: React.CSSProperties = {
  marginBottom: 7,
  color: '#7B8491',
  fontSize: 10,
  fontWeight: 850,
  textTransform: 'uppercase',
};

const fieldStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px minmax(0, 1fr)',
  gap: 8,
  alignItems: 'center',
  minHeight: 34,
  padding: '0 8px',
  borderRadius: 8,
  background: '#F8FAFC',
};

const fieldLabelStyle: React.CSSProperties = {
  color: '#7B8491',
  fontSize: 11,
  fontWeight: 850,
};

const controlStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 28,
  border: '1px solid transparent',
  borderRadius: 7,
  background: 'transparent',
  color: '#111827',
  padding: '0 8px',
  fontSize: 12,
  fontWeight: 750,
  outline: 'none',
};

const passwordEyeStyle: React.CSSProperties = {
  position: 'absolute',
  right: 2,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 26,
  height: 26,
  border: 'none',
  borderRadius: 7,
  background: 'transparent',
  color: '#7B8491',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
};

const schoolGridStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

function schoolChipStyle(active: boolean): React.CSSProperties {
  return {
    height: 27,
    border: `1px solid ${active ? '#FED7AA' : '#E8ECEF'}`,
    borderRadius: 7,
    background: active ? '#FFEDD5' : '#fff',
    color: active ? '#F59E0B' : '#6B7280',
    padding: '0 8px',
    fontSize: 11,
    fontWeight: 850,
    cursor: 'pointer',
  };
}

function statusBadgeStyle(status: EmployeeStatus): React.CSSProperties {
  const tone = status === 'active'
    ? { bg: '#ECFDF5', text: '#065F46' }
    : status === 'paused'
      ? { bg: '#FEF3C7', text: '#F59E0B' }
      : { bg: '#FEE2E2', text: '#991B1B' };
  return {
    display: 'inline-flex',
    alignItems: 'center',
    height: 21,
    borderRadius: 999,
    background: tone.bg,
    color: tone.text,
    padding: '0 8px',
    fontSize: 10,
    fontWeight: 850,
  };
}
