import React from 'react';

/** Водитель — человечек в фуражке. В наборе lucide такой иконки нет; нарисована в его стиле (линия 2px). */
export default function DriverIcon({ size = 24, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5.5 4.5c4-2.3 9-2.3 13 0L16.5 7h-9z" />
      <path d="M8.5 7v1.5a3.5 3.5 0 0 0 7 0V7" />
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    </svg>
  );
}
