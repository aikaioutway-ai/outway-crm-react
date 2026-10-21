import React from 'react';
import { List } from 'lucide-react';
export default function AllRecordsButton({onClick, label='Все записи'}:{onClick:()=>void;label?:string}) {
  return <button type="button" className="overview-icon-button" title={label} aria-label={label} onClick={onClick}><List size={18} aria-hidden="true"/></button>;
}
