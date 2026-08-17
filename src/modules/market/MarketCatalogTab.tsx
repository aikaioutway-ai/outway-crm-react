import React, { FormEvent, useEffect, useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { fetchMarketProducts, saveMarketProduct } from '../../services/marketService';
import { MarketProduct } from './marketTypes';

const money = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} сом`;

interface ProductModalProps {
  product: MarketProduct | null;
  sessionToken?: string;
  onClose: () => void;
  onSaved: (product: MarketProduct) => void;
}

function ProductModal({ product, sessionToken, onClose, onSaved }: ProductModalProps) {
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [unit, setUnit] = useState(product?.unit ?? 'шт');
  const [purchasePrice, setPurchasePrice] = useState(product ? String(product.purchasePrice) : '');
  const [salePrice, setSalePrice] = useState(product ? String(product.salePrice) : '');
  const [active, setActive] = useState(product?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const margin = (Number(salePrice) || 0) - (Number(purchasePrice) || 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !unit.trim() || purchasePrice === '' || salePrice === '') {
      setError('Заполните наименование, единицу измерения и обе цены.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await saveMarketProduct({
        id: product?.id,
        name: name.trim(),
        category: category.trim(),
        unit: unit.trim(),
        purchasePrice: Number(purchasePrice),
        salePrice: Number(salePrice),
        active,
      }, sessionToken);
      onSaved(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить товар');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="market-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="market-modal" role="dialog" aria-modal="true" aria-label="Товар">
        <div className="market-modal-head">
          <h2>{product ? 'Редактировать товар' : 'Новый товар'}</h2>
          <button className="market-modal-close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <form className="market-form" onSubmit={submit}>
          <div className="market-field full"><label>Наименование</label><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Например, рис длиннозёрный" /></div>
          <div className="market-field"><label>Категория</label><input value={category} onChange={e => setCategory(e.target.value)} placeholder="Крупы" /></div>
          <div className="market-field"><label>Ед. измерения</label><input value={unit} onChange={e => setUnit(e.target.value)} placeholder="кг" /></div>
          <div className="market-field"><label>Цена закупки (склад), сом</label><input type="number" min="0" step="0.01" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} /></div>
          <div className="market-field"><label>Цена продажи (школе), сом</label><input type="number" min="0" step="0.01" value={salePrice} onChange={e => setSalePrice(e.target.value)} /></div>
          <div className={`market-margin-preview${margin < 0 ? ' negative' : ''}`}>
            <span>Маржа с единицы</span>
            <strong>{money(margin)}</strong>
          </div>
          <div className="market-field full market-checkbox-field">
            <label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Активен (доступен для заказа)</label>
          </div>
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

export default function MarketCatalogTab({ sessionToken }: { sessionToken?: string }) {
  const [rows, setRows] = useState<MarketProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<MarketProduct | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMarketProducts(sessionToken).then(data => { if (active) setRows(data); }).catch(reason => {
      if (active) setLoadError(reason instanceof Error ? reason.message : 'Не удалось загрузить каталог');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionToken]);

  const handleSaved = (product: MarketProduct) => {
    setEditing(undefined);
    setRows(current => {
      const exists = current.some(row => row.id === product.id);
      return exists ? current.map(row => (row.id === product.id ? product : row)) : [product, ...current];
    });
  };

  return (
    <div className="market-panel">
      <div className="market-panel-title">
        <span>Каталог товаров</span>
        <button className="market-add" onClick={() => setEditing(null)}><Plus size={16} /> Новый товар</button>
      </div>
      {loadError && <div className="market-load-error">Не удалось загрузить данные: {loadError}. Проверьте, что миграция и функция market-api применены.</div>}
      {loading ? <div className="market-empty">Загрузка…</div> : rows.length === 0 ? (
        <div className="market-empty">Каталог пуст — добавьте первый товар</div>
      ) : (
        <div className="market-table-wrap">
          <table className="market-table">
            <thead><tr>
              <th>Наименование</th><th>Категория</th><th>Ед.</th>
              <th className="number">Закупка</th><th className="number">Продажа</th><th className="number">Маржа</th>
              <th>Статус</th><th></th>
            </tr></thead>
            <tbody>{rows.map(row => {
              const margin = row.salePrice - row.purchasePrice;
              return (
                <tr key={row.id}>
                  <td className="market-name">{row.name}</td>
                  <td>{row.category || '—'}</td>
                  <td>{row.unit}</td>
                  <td className="number">{money(row.purchasePrice)}</td>
                  <td className="number">{money(row.salePrice)}</td>
                  <td className="number" style={{ color: margin < 0 ? '#c33e3e' : '#17222F', fontWeight: 850 }}>{money(margin)}</td>
                  <td><span className={`market-badge${row.active ? '' : ' muted'}`}>{row.active ? 'Активен' : 'Скрыт'}</span></td>
                  <td><button className="market-icon-btn" onClick={() => setEditing(row)} aria-label="Редактировать"><Pencil size={15} /></button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {editing !== undefined && (
        <ProductModal product={editing} sessionToken={sessionToken} onClose={() => setEditing(undefined)} onSaved={handleSaved} />
      )}
    </div>
  );
}
