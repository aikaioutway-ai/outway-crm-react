import React from 'react';
import { Bus, Building2, CalendarDays, Layers, Users, WalletCards } from 'lucide-react';

function flatten(children: React.ReactNode): React.ReactElement<{ children?: React.ReactNode }>[] {
  return React.Children.toArray(children).flatMap(child => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return [];
    return child.type === React.Fragment ? flatten(child.props.children) : [child];
  });
}

/** One shared, compact summary layout for all expense composers. */
export default function PaymentSummary({ children }: { children: React.ReactNode }) {
  const elements = flatten(children);
  return <dl className="expense-summary-list">{elements.filter(item => item.type === 'dt').map((label, index) => {
    const value = elements[index * 2 + 1];
    const text = String(label.props.children);
    const Icon = /количество/i.test(text) ? Bus : /период/i.test(text) ? CalendarDays : /получател/i.test(text) ? Users : /школа|отдел/i.test(text) ? Building2 : /вид/i.test(text) ? WalletCards : Layers;
    return <div className="expense-summary-row" key={text}><span className="expense-summary-icon" aria-hidden="true"><Icon size={17} /></span><div><dt className="expense-summary-label-sr">{label.props.children}</dt><dd>{value?.props.children}</dd></div></div>;
  })}</dl>;
}
