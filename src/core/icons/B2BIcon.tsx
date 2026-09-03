import React from 'react';

interface B2BIconProps {
  size?: number;
}

export default function B2BIcon({ size = 24 }: B2BIconProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: 'linear-gradient(145deg, #39C5BA 0%, #218B91 100%)',
        color: '#fff',
        boxShadow: '0 3px 8px rgba(33, 139, 145, .28), inset 0 1px 0 rgba(255, 255, 255, .25)',
        fontSize: Math.max(7, Math.round(size * 0.34)),
        fontWeight: 900,
        lineHeight: 1,
        letterSpacing: '-0.06em',
      }}
    >
      B2B
    </span>
  );
}
