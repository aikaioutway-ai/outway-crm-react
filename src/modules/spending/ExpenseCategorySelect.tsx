import React from 'react';
import type { SpendingEntry } from './SpendingModule';
export type CategoryChange = (category: SpendingEntry['category'], current: SpendingEntry) => void;
export default function ExpenseCategorySelect({entry,categories,onChange,disabled}:{entry:SpendingEntry;categories:SpendingEntry['category'][];onChange?:CategoryChange;disabled:boolean}) {
  return entry.id && onChange ? <label className="payment-category-select"><span>Категория расхода</span><select aria-label="Категория расхода" value={entry.category} disabled={disabled} onChange={event=>onChange(event.target.value as SpendingEntry['category'],entry)}>{categories.map(category=><option key={category}>{category}</option>)}</select></label> : <p className="payment-summary-kind">{entry.category}</p>;
}
