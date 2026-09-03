import { FormEvent, useState } from 'react';
import { Building2, ClipboardList, CreditCard, FileCheck2, FileText, Landmark, Mail, MapPin, Pencil, Phone, Plus, School, UserRound, X } from 'lucide-react';
import { B2B_QUERY_KEYS, useB2BClients, useB2BOrders } from '../../hooks/useB2BData';
import { B2BOrderRecord, createB2BClient, updateB2BClient } from '../../services/b2bDataService';
import useB2BPayments from '../../hooks/useB2BPayments';
import { formatB2BPaymentMethod } from '../../services/b2bPaymentService';
import { downloadB2BGeneratedDocument, generatedDocumentNumber } from '../../services/b2bDocumentService';
import { B2B_ORDER_STATUSES } from './B2BOrders';
import { queryClient } from '../../services/queryClient';
import B2BClientDocumentsTab from './B2BClientDocumentsTab';
import { B2BClientOrderEditModal, B2BClientPaymentEditModal } from './B2BClientEditModals';
import { B2BPaymentRecord } from '../../services/b2bPaymentService';

type ClientType = 'individual' | 'company' | 'school';

interface B2BClientForm {
  clientType: ClientType;
  companyName: string;
  contactName: string;
  phone1: string;
  phone2: string;
  email: string;
  comments: string;
  orgName: string;
  inn: string;
  okpo: string;
  legalAddress: string;
  bankName: string;
  bik: string;
  bankAccount: string;
  signerPosition: string;
  signerName: string;
}

interface B2BClient extends B2BClientForm { id: string; }
type ClientCardTab = 'main' | 'orders' | 'payments' | 'documents';

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  individual: 'Физлицо', company: 'Юрлицо', school: 'Школа',
};

const EMPTY_CLIENT: B2BClientForm = {
  clientType: 'company', companyName: '', contactName: '', phone1: '', phone2: '', email: '', comments: '',
  orgName: '', inn: '', okpo: '', legalAddress: '', bankName: '', bik: '', bankAccount: '', signerPosition: '', signerName: '',
};

export default function B2BClients() {
  const { data: clients = [], isLoading } = useB2BClients();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<B2BOrderRecord | null>(null);
  const [editingPayment, setEditingPayment] = useState<B2BPaymentRecord | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientCardTab, setClientCardTab] = useState<ClientCardTab>('main');
  const { data: orders = [] } = useB2BOrders();
  const payments = useB2BPayments();
  const [form, setForm] = useState<B2BClientForm>({ ...EMPTY_CLIENT });
  const [error, setError] = useState('');
  const showRequisites = form.clientType === 'company' || form.clientType === 'school';
  const selectedClient = clients.find(client => client.id === selectedClientId) ?? null;
  const selectedClientOrders = selectedClient ? orders.filter(order => order.clientId === selectedClient.id) : [];
  const selectedOrderIds = new Set(selectedClientOrders.map(order => order.id));
  const selectedClientPayments = payments.filter(payment => selectedOrderIds.has(payment.orderId));
  const clientOrdersTotal = selectedClientOrders.reduce((sum, order) => sum + order.total, 0);
  const clientPaidTotal = selectedClientPayments.filter(payment => payment.status === 'confirmed').reduce((sum, payment) => sum + payment.amount, 0);

  const set = (field: keyof B2BClientForm, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
    if (error) setError('');
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingClientId(null);
    setForm({ ...EMPTY_CLIENT });
    setError('');
  };

  const openNewClient = () => {
    setEditingClientId(null);
    setForm({ ...EMPTY_CLIENT });
    setError('');
    setModalOpen(true);
  };

  const openClientEdit = () => {
    if (!selectedClient) return;
    setEditingClientId(selectedClient.id);
    setForm({ ...selectedClient });
    setError('');
    setModalOpen(true);
  };

  const openClient = (id: string) => {
    setClientCardTab('main');
    setSelectedClientId(id);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (showRequisites && !form.companyName.trim()) return setError('Укажите название компании или школы.');
    if (!form.contactName.trim()) return setError('Укажите ФИО контактного лица.');
    if (!form.phone1.trim()) return setError('Укажите основной телефон.');
    if (showRequisites && !form.orgName.trim()) return setError('Укажите полное наименование организации.');
    if (showRequisites && !form.signerPosition) return setError('Выберите должность подписанта.');
    if (showRequisites && !form.signerName.trim()) return setError('Укажите ФИО подписанта.');

    const normalize = (value: string) => value.toLowerCase().replace(/\s|\+|\(|\)|-/g, '');
    const duplicate = clients.find(client => client.id !== editingClientId &&
      (form.inn.trim() && client.inn.trim() === form.inn.trim()) ||
      normalize(client.phone1) === normalize(form.phone1) ||
      (normalize(client.contactName) === normalize(form.contactName) && normalize(client.companyName) === normalize(form.companyName))
    );
    if (duplicate) return setError(`Возможный дубль: ${duplicate.companyName || duplicate.contactName}.`);

    const clean = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])) as unknown as B2BClientForm;
    const values = {
      ...clean,
      ...(showRequisites ? {} : {
        companyName: '', orgName: '', inn: '', okpo: '', legalAddress: '', bankName: '', bik: '', bankAccount: '', signerPosition: '', signerName: '',
      }),
    };
    try {
      if (editingClientId) {
        await updateB2BClient(editingClientId, values);
        queryClient.setQueryData<B2BClient[]>(B2B_QUERY_KEYS.clients, (current: B2BClient[] | undefined) => (current ?? []).map(client => client.id === editingClientId ? { ...values, id: editingClientId } : client));
      } else {
        const created = await createB2BClient(values);
        queryClient.setQueryData<B2BClient[]>(B2B_QUERY_KEYS.clients, (current: B2BClient[] | undefined) => [created, ...(current ?? [])]);
      }
      closeModal();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить клиента.');
    }
  };

  return (
    <div className="b2b-clients">
      <div className="b2b-panel-head">
        <div><h2>Клиенты</h2><p>Компании, школы и частные заказчики</p></div>
        <button className="b2b-primary-button" type="button" onClick={openNewClient}><Plus size={17} /> Новый клиент</button>
      </div>

      {isLoading ? <div className="b2b-clients-empty"><strong>Загрузка клиентов…</strong></div> : clients.length === 0 ? (
        <div className="b2b-clients-empty">
          <span><UserRound size={28} /></span><h3>Клиентов пока нет</h3>
          <p>Добавьте первого клиента, чтобы начать работу с заказами B2B.</p>
          <button className="b2b-secondary-button" type="button" onClick={openNewClient}><Plus size={16} /> Добавить клиента</button>
        </div>
      ) : (
        <div className="b2b-client-grid">
          {clients.map(client => {
            const ClientIcon = client.clientType === 'school' ? School : client.clientType === 'company' ? Building2 : UserRound;
            return (
              <article className="b2b-client-card" key={client.id} role="button" tabIndex={0} onClick={() => openClient(client.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openClient(client.id); }}>
                <div className="b2b-client-card-top">
                  <span className="b2b-client-avatar"><ClientIcon size={20} /></span>
                  <div className="b2b-client-badges"><span>{CLIENT_TYPE_LABELS[client.clientType]}</span><span className="b2b-client-status">Активен</span></div>
                </div>
                <h3>{client.companyName || client.contactName}</h3>
                {client.companyName && client.orgName && client.companyName !== client.orgName && <p className="b2b-client-org">{client.orgName}</p>}
                <div className="b2b-client-details">
                  <div><UserRound size={15} /><span>{client.contactName}</span></div>
                  <div><Phone size={15} /><span>{client.phone1}{client.phone2 ? ` · ${client.phone2}` : ''}</span></div>
                  <div><Mail size={15} /><span>{client.email || 'Почта не указана'}</span></div>
                  {client.legalAddress && <div><MapPin size={15} /><span>{client.legalAddress}</span></div>}
                  {client.inn && <div><Landmark size={15} /><span>ИНН {client.inn}{client.okpo ? ` · ОКПО ${client.okpo}` : ''}</span></div>}
                </div>
                {client.comments && <p className="b2b-client-comment">{client.comments}</p>}
              </article>
            );
          })}
        </div>
      )}

      {selectedClient && (
        <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedClientId(null); }}>
          <article className="b2b-client-profile" role="dialog" aria-modal="true" aria-labelledby="b2b-client-card-title">
            <header className="b2b-client-profile-head">
              <div className="b2b-client-profile-identity">
                <span>{selectedClient.clientType === 'school' ? <School size={22} /> : selectedClient.clientType === 'company' ? <Building2 size={22} /> : <UserRound size={22} />}</span>
                <div><small>{CLIENT_TYPE_LABELS[selectedClient.clientType]}</small><h2 id="b2b-client-card-title">{selectedClient.companyName || selectedClient.contactName}</h2><p>{selectedClient.contactName}</p></div>
              </div>
              <div className="b2b-client-profile-summary">
                <span><b>{selectedClientOrders.length}</b> заказов</span>
                <span><b>{clientOrdersTotal.toLocaleString()}</b> сом</span>
                <button type="button" onClick={openClientEdit} aria-label="Редактировать клиента"><Pencil size={16} /></button>
                <button type="button" onClick={() => setSelectedClientId(null)} aria-label="Закрыть"><X size={18} /></button>
              </div>
            </header>

            <nav className="b2b-order-card-tabs" aria-label="Разделы карточки клиента">
              {([
                ['main', 'Основной', UserRound],
                ['orders', `Заказы (${selectedClientOrders.length})`, ClipboardList],
                ['payments', `Оплаты (${selectedClientPayments.length})`, CreditCard],
                ['documents', 'Документы', FileText],
              ] as const).map(([key, label, Icon]) => <button key={key} type="button" className={clientCardTab === key ? 'active' : ''} onClick={() => setClientCardTab(key)}><Icon size={15} />{label}</button>)}
            </nav>

            <div className="b2b-client-profile-body">
              {clientCardTab === 'main' && <div className="b2b-client-main-grid">
                <section><h3><UserRound size={16} /> Контактное лицо</h3><strong>{selectedClient.contactName}</strong><div><Phone size={14} />{selectedClient.phone1}</div>{selectedClient.phone2 && <div><Phone size={14} />{selectedClient.phone2}</div>}<div><Mail size={14} />{selectedClient.email || 'Почта не указана'}</div></section>
                <section><h3><Landmark size={16} /> Организация</h3><strong>{selectedClient.orgName || selectedClient.companyName || 'Физическое лицо'}</strong><div>ИНН: {selectedClient.inn || '—'}</div><div>ОКПО: {selectedClient.okpo || '—'}</div><div><MapPin size={14} />{selectedClient.legalAddress || 'Адрес не указан'}</div></section>
                <section><h3><CreditCard size={16} /> Банковские реквизиты</h3><strong>{selectedClient.bankName || 'Банк не указан'}</strong><div>БИК: {selectedClient.bik || '—'}</div><div>Счёт: {selectedClient.bankAccount || '—'}</div></section>
                <section><h3><FileCheck2 size={16} /> Подписант</h3><strong>{selectedClient.signerName || 'Не указан'}</strong><div>{selectedClient.signerPosition || 'Должность не указана'}</div>{selectedClient.comments && <p>{selectedClient.comments}</p>}</section>
              </div>}

              {clientCardTab === 'orders' && (selectedClientOrders.length ? <div className="b2b-client-orders-wrap"><table className="b2b-client-orders-table"><thead><tr><th>Заказ</th><th>Дата</th><th>Маршрут</th><th>Транспорт</th><th className="number">Сумма</th><th>Статус</th><th>Документы</th></tr></thead><tbody>{selectedClientOrders.map(order => {
                const status = B2B_ORDER_STATUSES.find(item => item.key === order.status)?.label ?? order.status;
                return <tr key={order.id}><td className="order-number">{order.number}</td><td>{order.departureDate || order.requestDate}</td><td><span className="b2b-client-order-route">{order.routeFrom}<b>→</b>{order.routeTo}</span></td><td>{order.transportCount}× {order.transport}</td><td className="number">{order.total.toLocaleString()} сом</td><td><span className={`b2b-client-order-status status-${order.status}`}>{status}</span></td><td><div className="b2b-client-doc-actions"><button type="button" onClick={() => setEditingOrder(order)} title="Редактировать заказ"><Pencil size={14} /></button><button type="button" onClick={() => void downloadB2BGeneratedDocument('invoice', order)} title={`Скачать счёт ${generatedDocumentNumber('invoice', order.number)}`}><FileText size={14} /> Счёт</button><button type="button" onClick={() => void downloadB2BGeneratedDocument('act', order)} title={`Скачать акт ${generatedDocumentNumber('act', order.number)}`}><FileCheck2 size={14} /> Акт</button></div></td></tr>;
              })}</tbody></table></div> : <div className="b2b-client-tab-empty"><ClipboardList size={28} /><strong>Заказов пока нет</strong><span>Новые заказы этого клиента появятся здесь.</span></div>)}

              {clientCardTab === 'payments' && <div className="b2b-client-payments-panel">
                <div className="b2b-client-money-summary"><article><span>Заказы</span><strong>{clientOrdersTotal.toLocaleString()} сом</strong></article><article className="paid"><span>Подтверждено</span><strong>{clientPaidTotal.toLocaleString()} сом</strong></article><article className="debt"><span>Остаток</span><strong>{Math.max(0, clientOrdersTotal - clientPaidTotal).toLocaleString()} сом</strong></article></div>
                {selectedClientPayments.length ? <div className="b2b-client-orders-wrap"><table className="b2b-client-orders-table"><thead><tr><th>Дата</th><th>Заказ</th><th>Способ</th><th className="number">Сумма</th><th>Статус</th><th>Комментарий</th><th></th></tr></thead><tbody>{selectedClientPayments.map(payment => <tr key={payment.id}><td>{payment.paymentDate}</td><td className="order-number">{payment.orderNumber}</td><td>{formatB2BPaymentMethod(payment.method)}</td><td className="number">{payment.amount.toLocaleString()} сом</td><td><span className={`b2b-client-payment-status ${payment.status}`}>{payment.status === 'confirmed' ? 'Подтверждено' : payment.status === 'pending' ? 'На проверке' : 'Отклонено'}</span></td><td>{payment.comment || '—'}</td><td><button className="b2b-client-edit-button" type="button" onClick={() => setEditingPayment(payment)} title="Редактировать оплату"><Pencil size={14} /></button></td></tr>)}</tbody></table></div> : <div className="b2b-client-tab-empty"><CreditCard size={28} /><strong>Оплат пока нет</strong><span>Платежи по заказам клиента появятся здесь.</span></div>}
              </div>}

              {clientCardTab === 'documents' && <B2BClientDocumentsTab orders={selectedClientOrders} />}
            </div>
          </article>
        </div>
      )}

      {modalOpen && (
        <div className="b2b-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
          <div className="b2b-modal" role="dialog" aria-modal="true" aria-labelledby="b2b-client-modal-title">
            <div className="b2b-modal-head">
              <div><h2 id="b2b-client-modal-title">{editingClientId ? 'Редактировать клиента' : 'Новый клиент'}</h2><p>{editingClientId ? 'Измените данные и реквизиты клиента' : 'Добавьте данные клиента'}</p></div>
              <button type="button" onClick={closeModal} aria-label="Закрыть"><X size={18} /></button>
            </div>
            <form className="b2b-client-form" onSubmit={submit}>
              <section className="b2b-form-column">
                <div className="b2b-form-section"><UserRound size={16} /> Основные данные</div>
                <label><span>Тип клиента *</span><select value={form.clientType} onChange={event => set('clientType', event.target.value)}><option value="individual">Физлицо</option><option value="company">Юрлицо</option><option value="school">Школа</option></select></label>
                {showRequisites && <label><span>Название компании/школы *</span><input autoFocus value={form.companyName} onChange={event => set('companyName', event.target.value)} /></label>}
                <label><span>ФИО контактного лица *</span><input autoFocus={!showRequisites} value={form.contactName} onChange={event => set('contactName', event.target.value)} /></label>
                <div className="b2b-form-row">
                  <label><span>Телефон 1 *</span><input value={form.phone1} onChange={event => set('phone1', event.target.value)} placeholder="+996 555 000 000" /></label>
                  <label><span>Телефон 2</span><input value={form.phone2} onChange={event => set('phone2', event.target.value)} placeholder="+996 700 000 000" /></label>
                </div>
                <label><span>Электронная почта</span><input type="email" value={form.email} onChange={event => set('email', event.target.value)} placeholder="company@example.com" /></label>
                <label><span>Комментарий</span><textarea value={form.comments} onChange={event => set('comments', event.target.value)} placeholder="Необязательно" /></label>
              </section>

              <section className="b2b-form-column requisites">
                <div className="b2b-form-section"><Landmark size={16} /> Реквизиты</div>
                {showRequisites ? <>
                  <label><span>Полное наименование организации *</span><input value={form.orgName} onChange={event => set('orgName', event.target.value)} /></label>
                  <div className="b2b-form-row">
                    <label><span>ИНН</span><input value={form.inn} onChange={event => set('inn', event.target.value)} /></label>
                    <label><span>ОКПО</span><input value={form.okpo} onChange={event => set('okpo', event.target.value)} /></label>
                  </div>
                  <label><span>Юридический адрес</span><input value={form.legalAddress} onChange={event => set('legalAddress', event.target.value)} /></label>
                  <label><span>Название банка</span><input value={form.bankName} onChange={event => set('bankName', event.target.value)} /></label>
                  <div className="b2b-form-row">
                    <label><span>БИК</span><input value={form.bik} onChange={event => set('bik', event.target.value)} /></label>
                    <label><span>Расчётный счёт</span><input value={form.bankAccount} onChange={event => set('bankAccount', event.target.value)} /></label>
                  </div>
                  <div className="b2b-form-row">
                    <label><span>Должность подписанта *</span><select value={form.signerPosition} onChange={event => set('signerPosition', event.target.value)}><option value="">Выберите</option><option value="general_director">Генеральный директор</option><option value="director">Директор</option><option value="deputy_director">Заместитель директора</option><option value="other">Иное</option></select></label>
                    <label><span>ФИО подписанта *</span><input value={form.signerName} onChange={event => set('signerName', event.target.value)} /></label>
                  </div>
                </> : (
                  <div className="b2b-requisites-empty"><Landmark size={25} /><strong>Для физлица реквизиты не нужны</strong><span>Выберите «Юрлицо» или «Школа», чтобы заполнить банковские и юридические данные.</span></div>
                )}
              </section>
              {error && <div className="b2b-form-error">{error}</div>}
              <div className="b2b-form-actions"><button className="b2b-cancel-button" type="button" onClick={closeModal}>Отмена</button><button className="b2b-primary-button" type="submit">{editingClientId ? 'Сохранить изменения' : 'Сохранить клиента'}</button></div>
            </form>
          </div>
        </div>
      )}
      {editingOrder && <B2BClientOrderEditModal order={editingOrder} onClose={() => setEditingOrder(null)} />}
      {editingPayment && <B2BClientPaymentEditModal payment={editingPayment} onClose={() => setEditingPayment(null)} />}
    </div>
  );
}
